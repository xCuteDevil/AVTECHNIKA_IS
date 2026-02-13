# main.py
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import re
import unicodedata
import base64
from pathlib import Path

from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi.middleware.cors import CORSMiddleware


from database import SessionLocal, engine
from models import (
    Base,
    Item,
    ItemAccessory,
    Customer,
    Loan,
    User,
    UserRole,
    Order,          # <- tohle
    OrderStatus,    # <- a tohle
)



from datetime import datetime




# Pro SQLite vývoj: vytvoří tabulky, pokud ještě neexistují, a provede jednoduché migrace
Base.metadata.create_all(bind=engine)

def _ensure_order_logistics_columns():
    # SQLite: přidáme sloupce depart_at, return_at, pokud neexistují, a vyplníme je z date_out/date_due
    try:
        with engine.connect() as conn:
            info = conn.exec_driver_sql("PRAGMA table_info(orders)").fetchall()
            cols = {row[1] for row in info}  # row[1] = name
            if "depart_at" not in cols:
                conn.exec_driver_sql("ALTER TABLE orders ADD COLUMN depart_at DATETIME NULL")
            if "return_at" not in cols:
                conn.exec_driver_sql("ALTER TABLE orders ADD COLUMN return_at DATETIME NULL")
            # backfill, pouze pokud jsou NULL
            conn.exec_driver_sql("""
                UPDATE orders
                SET depart_at = COALESCE(depart_at, date_out),
                    return_at = COALESCE(return_at, date_due)
            """)
    except Exception:
        # nechceme blokovat běh, když PRAGMA/ALTER není dostupný
        pass

_ensure_order_logistics_columns()

app = FastAPI(title="AV Technika IS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://192.168.45.118:5173",  # přístup z telefonu v LAN
        "https://192.168.45.118:5173",  # https varianta pro kameru
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# ---------- DB dependency ----------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Pydantic schémata – ITEMS ----------

class ItemBase(BaseModel):
    code: Optional[str] = None
    name: str
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    serial_number: Optional[str] = None
    location: Optional[str] = None
    condition_note: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class ItemOut(ItemBase):
    id: int
    # součástí (accessories) – volitelné, jen pro výpis
    # jednoduchý výstup: pouze název a id
    class AccessoryMini(BaseModel):
        id: int
        name: str
        quantity: int
        is_required: bool
        model_config = ConfigDict(from_attributes=True)
    accessories: List[AccessoryMini] = []
    status_now: Optional[str] = None  # VE_SKLADU | NA_CESTE_NA_AKCI | NA_AKCI | NA_CESTE_Z_AKCE | MIMO_SKLAD
    active_order_id: Optional[int] = None
    active_order_event_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class ItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    serial_number: Optional[str] = None
    location: Optional[str] = None
    condition_note: Optional[str] = None

# ---------- Pydantic schémata – CUSTOMERS ----------

class CustomerBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = None


class CustomerOut(CustomerBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# ---------- Pydantic schémata – LOANS ----------

class LoanBase(BaseModel):
    item_id: int
    customer_id: int
    date_due: datetime
    condition_out: Optional[str] = None
    note: Optional[str] = None
    order_id: Optional[int] = None   # NOVÉ



class LoanCreate(LoanBase):
    pass


class LoanReturn(BaseModel):
    condition_in: Optional[str] = None


class LoanOut(BaseModel):
    id: int
    item_id: int
    customer_id: int
    date_out: datetime
    date_due: datetime
    date_in: Optional[datetime] = None
    condition_out: Optional[str] = None
    condition_in: Optional[str] = None
    note: Optional[str] = None
    order_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# ---------- Pydantic schémata – ORDERS (zakázky) ----------

class OrderBase(BaseModel):
    customer_id: int
    date_due: datetime
    date_out: Optional[datetime] = None
    depart_at: Optional[datetime] = None
    return_at: Optional[datetime] = None
    event_name: Optional[str] = None
    event_location: Optional[str] = None
    note: Optional[str] = None


class OrderCreate(OrderBase):
    code: Optional[str] = None


class OrderUpdate(BaseModel):
    # povolíme editovat běžné údaje zakázky
    date_out: Optional[datetime] = None
    date_due: Optional[datetime] = None
    depart_at: Optional[datetime] = None
    return_at: Optional[datetime] = None
    event_name: Optional[str] = None
    event_location: Optional[str] = None
    note: Optional[str] = None

class OrderAddItem(BaseModel):
    item_code: str
    condition_out: Optional[str] = None
    note: Optional[str] = None

# --- Normalization helpers for item codes (handle fancy dashes, trim, lowercase) ---
_DASHES = ("\u2013", "\u2014", "\u2212", "\u2010", "\u2011")  # en dash, em dash, minus, hyphen, non‑breaking hyphen

def _normalize_code_py(s: Optional[str]) -> str:
    if not s:
        return ""
    out = s.strip()
    for ch in _DASHES:
        out = out.replace(ch, "-")
    # normalize non‑breaking space
    out = out.replace("\u00A0", "")
    return out.lower()

def _normalize_code_sql(col):
    """SQLAlchemy expression that mimics _normalize_code_py for DB-side compare."""
    expr = func.lower(col)
    for ch in _DASHES:
        expr = func.replace(expr, ch, "-")
    # remove NBSP characters
    expr = func.replace(expr, "\u00A0", "")
    # trim outer whitespace
    expr = func.trim(expr)
    return expr


class OrderOut(BaseModel):
    id: int
    code: Optional[str] = None
    customer_id: int
    created_at: datetime
    date_out: datetime
    date_due: datetime
    depart_at: Optional[datetime] = None
    return_at: Optional[datetime] = None
    date_closed: Optional[datetime] = None
    event_name: Optional[str] = None
    event_location: Optional[str] = None
    note: Optional[str] = None
    status: OrderStatus

    model_config = ConfigDict(from_attributes=True)



# ---------- Základ ----------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- ITEMS endpointy ----------

def _slugify_for_code(name: Optional[str], category: Optional[str]) -> str:
    src = (name or category or "ITEM").strip()
    if not src:
        src = "ITEM"
    # remove diacritics
    nfkd = unicodedata.normalize("NFKD", src)
    ascii_str = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    # replace non-alnum with hyphen, collapse, trim
    s = re.sub(r"[^A-Za-z0-9]+", "-", ascii_str)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    if not s:
        s = "ITEM"
    return s.upper()


def _generate_unique_code(db: Session, name: Optional[str], category: Optional[str]) -> str:
    base = _slugify_for_code(name, category)
    candidate = base[:50]  # DB limit safeguard
    # normalize function for compare
    def exists(code: str) -> bool:
        norm = _normalize_code_py(code)
        return db.query(Item).filter(_normalize_code_sql(Item.code) == norm).first() is not None
    if not exists(candidate):
        return candidate
    # try with numeric suffix -01, -02, ...
    i = 1
    while True:
        suffix = f"-{i:02d}"
        trimmed = base[: max(1, 50 - len(suffix))]
        candidate = f"{trimmed}{suffix}"
        if not exists(candidate):
            return candidate
        i += 1


def _qr_output_dir() -> Path:
    # Uložíme do frontend public/qr, aby se dalo snadno tisknout/stahovat
    root = Path(__file__).resolve().parent
    out = root / "avtechnika-dashboard" / "public" / "qr"
    out.mkdir(parents=True, exist_ok=True)
    return out


@app.post("/items", response_model=ItemOut)
def create_item(item_in: ItemCreate, db: Session = Depends(get_db)):
    # Pokud kód není zadán, vygenerujeme unikátní podle názvu/kategorie
    input_code = (item_in.code or "").strip()
    if input_code:
        existing = db.query(Item).filter(_normalize_code_sql(Item.code) == _normalize_code_py(input_code)).first()
        if existing:
            # Pokud existuje archivovaná položka se stejným kódem, obnovíme ji a zaktualizujeme údaje
            if hasattr(existing, "is_active") and existing.is_active is False:
                existing.name = item_in.name
                existing.category = item_in.category
                existing.manufacturer = item_in.manufacturer
                existing.serial_number = item_in.serial_number
                existing.location = item_in.location
                existing.condition_note = item_in.condition_note
                existing.is_active = True
                db.commit()
                db.refresh(existing)
                return existing
            raise HTTPException(status_code=400, detail="Položka s tímto kódem už existuje.")
        code_to_use = input_code
    else:
        code_to_use = _generate_unique_code(db, item_in.name, item_in.category)

    item = Item(
        code=code_to_use,
        name=item_in.name,
        category=item_in.category,
        manufacturer=item_in.manufacturer,
        serial_number=item_in.serial_number,
        location=item_in.location,
        condition_note=item_in.condition_note,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


class ItemQrImageIn(BaseModel):
    png_base64: str


@app.post("/items/{item_id}/qr_image", status_code=204)
def save_item_qr_image(item_id: int, payload: ItemQrImageIn, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    data = payload.png_base64 or ""
    try:
        if data.startswith("data:"):
            data = data.split(",", 1)[1]
        raw = base64.b64decode(data, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatná PNG data.")
    # Bezpečný název souboru z kódu položky
    code = item.code or f"item-{item.id}"
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", code).strip("-")
    if not safe:
        safe = f"item-{item.id}"
    out_dir = _qr_output_dir()
    path = out_dir / f"{safe}.png"
    try:
        with open(path, "wb") as f:
            f.write(raw)
    except Exception:
        raise HTTPException(status_code=500, detail="Nepodařilo se uložit obrázek.")
    return


@app.get("/items", response_model=List[ItemOut])
def list_items(include_inactive: bool = False, db: Session = Depends(get_db)):
    if include_inactive:
        items = db.query(Item).order_by(Item.id).all()
    else:
        items = (
            db.query(Item)
            .filter(Item.is_active.is_(True))
            .order_by(Item.id)
            .all()
        )
    # Vypočítat aktuální stav položky podle aktivní výpůjčky a oken zakázky
    now = datetime.utcnow()
    active_rows = (
        db.query(Loan, Order)
        .outerjoin(Order, Loan.order_id == Order.id)
        .filter(Loan.date_in.is_(None))
        .all()
    )
    by_item: dict[int, tuple[Loan, Optional[Order]]] = {}
    for loan, order in active_rows:
        # pokud by teoreticky bylo víc aktivních, vezmeme první
        if loan.item_id not in by_item:
            by_item[loan.item_id] = (loan, order)
    for it in items:
        loan_order = by_item.get(it.id)
        if not loan_order:
            setattr(it, "status_now", "VE_SKLADU")
            continue
        loan, order = loan_order
        depart_at = (order.depart_at if order else None) or loan.date_out
        start_at = (order.date_out if order else None) or loan.date_out
        end_at = (order.date_due if order else None) or loan.date_due
        return_at = (order.return_at if order else None) or loan.date_due
        status = "MIMO_SKLAD"
        try:
            if depart_at and now < depart_at:
                status = "VE_SKLADU"
            elif depart_at and start_at and depart_at <= now < start_at:
                status = "NA_CESTE_NA_AKCI"
            elif start_at and end_at and start_at <= now < end_at:
                status = "NA_AKCI"
            elif end_at and return_at and end_at <= now < return_at:
                status = "NA_CESTE_Z_AKCE"
            else:
                status = "MIMO_SKLAD"
        except Exception:
            status = "MIMO_SKLAD"
        setattr(it, "status_now", status)
        if order:
            setattr(it, "active_order_id", order.id)
            setattr(it, "active_order_event_name", order.event_name)
        else:
            setattr(it, "active_order_id", loan.order_id)
            setattr(it, "active_order_event_name", None)
    return items

@app.get("/items/{item_id}/loans", response_model=List[LoanOut])
def list_item_loans(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    loans = (
        db.query(Loan)
        .filter(Loan.item_id == item_id)
        .order_by(Loan.date_out.desc())
        .all()
    )
    return loans

@app.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")

    # neumožníme smazat, pokud existují (byť historické) výpůjčky na danou položku
    loans_count = db.query(Loan).filter(Loan.item_id == item_id).count()
    if loans_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Položku nelze smazat – existují výpůjčky pro tuto položku.",
        )

    # pokusíme se smazat i vygenerovaný QR PNG ze složky public/qr
    try:
        code = item.code or f"item-{item.id}"
        safe = re.sub(r"[^A-Za-z0-9_-]+", "-", code).strip("-") or f"item-{item.id}"
        out_dir = _qr_output_dir()
        path = out_dir / f"{safe}.png"
        if path.exists():
            path.unlink()
    except Exception:
        # neblokovat mazání položky kvůli IO chybě
        pass

    db.delete(item)
    db.commit()
    return None


@app.patch("/items/{item_id}/archive", response_model=ItemOut)
def archive_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    item.is_active = False
    db.commit()
    db.refresh(item)
    return item

# ---------- ITEM ACCESSORIES (součástí) ----------

class AccessoryCreate(BaseModel):
    name: str
    quantity: Optional[int] = 1
    is_required: Optional[bool] = True

class AccessoryOut(BaseModel):
    id: int
    name: str
    quantity: int
    is_required: bool
    model_config = ConfigDict(from_attributes=True)

@app.get("/items/{item_id}/accessories", response_model=List[AccessoryOut])
def list_item_accessories(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    return item.accessories

@app.post("/items/{item_id}/accessories", response_model=AccessoryOut)
def add_item_accessory(item_id: int, acc_in: AccessoryCreate, db: Session = Depends(get_db)):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")
    acc = ItemAccessory(item_id=item_id, name=acc_in.name, quantity=acc_in.quantity or 1, is_required=bool(acc_in.is_required))
    db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc

@app.delete("/items/{item_id}/accessories/{acc_id}", status_code=204)
def delete_item_accessory(item_id: int, acc_id: int, db: Session = Depends(get_db)):
    acc = db.query(ItemAccessory).get(acc_id)
    if not acc or acc.item_id != item_id:
        raise HTTPException(status_code=404, detail="Součást nenalezena.")
    db.delete(acc)
    db.commit()
    return None

@app.put("/items/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    item_in: ItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.query(Item).get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")

    data = item_in.dict(exclude_unset=True)
    # ohlídat unikátní kód
    new_code = data.get("code")
    if new_code is not None and new_code != item.code:
        exists = db.query(Item).filter(Item.code == new_code).first()
        if exists:
            raise HTTPException(status_code=400, detail="Položka s tímto kódem už existuje.")

    for key, value in data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item

# ---------- CUSTOMERS endpointy ----------

@app.post("/customers", response_model=CustomerOut)
def create_customer(customer_in: CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(
        name=customer_in.name,
        contact_person=customer_in.contact_person,
        email=customer_in.email,
        phone=customer_in.phone,
        note=customer_in.note,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@app.get("/customers", response_model=List[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).order_by(Customer.name).all()
    return customers


@app.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")
    return customer


@app.put("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    customer_in: CustomerUpdate,
    db: Session = Depends(get_db),
):
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")

    data = customer_in.dict(exclude_unset=True)
    for key, value in data.items():
        setattr(customer, key, value)

    db.commit()
    db.refresh(customer)
    return customer


@app.delete("/customers/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")
    # Základní ochrana: nelze smazat zákazníka, pokud má zakázky nebo výpůjčky
    orders_count = db.query(Order).filter(Order.customer_id == customer_id).count()
    loans_count = db.query(Loan).filter(Loan.customer_id == customer_id).count()
    if orders_count > 0 or loans_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Zákazníka nelze smazat – existují navázané "
                f"{'zakázky' if orders_count > 0 else ''}"
                f"{' a ' if orders_count > 0 and loans_count > 0 else ''}"
                f"{'výpůjčky' if loans_count > 0 else ''}."
            ),
        )
    db.delete(customer)
    db.commit()
    return None

@app.get("/customers/{customer_id}/loans", response_model=List[LoanOut])
def list_customer_loans(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")
    loans = (
        db.query(Loan)
        .filter(Loan.customer_id == customer_id)
        .order_by(Loan.date_out.desc())
        .all()
    )
    return loans

# ---------- LOANS endpointy ----------

def get_or_create_system_user(db: Session) -> User:
    """
    Provizorní řešení: dokud nemáme login,
    vytvoříme si 'system' uživatele, kterého dáme do issued_by.
    """
    user = db.query(User).get(1)
    if user:
        return user

    user = User(
        email="system@example.com",
        password_hash="!",
        full_name="System User",
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/loans", response_model=LoanOut)
def create_loan(loan_in: LoanCreate, db: Session = Depends(get_db)):
    # 0) Pokud je zadáno order_id, ověříme zakázku
    order = None
    if loan_in.order_id is not None:
        order = db.query(Order).get(loan_in.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
        if order.status == OrderStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Zakázka je zrušená.")

    # 1) Zkontrolovat, že položka existuje
    item = db.query(Item).get(loan_in.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")

    # 2) Zkontrolovat, že zákazník existuje
    customer = db.query(Customer).get(loan_in.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")

    # 3) Nastavit plánované okno výpůjčky a zkontrolovat překryv s jinými výpůjčkami
    if order is not None:
        new_start = order.depart_at or order.date_out or datetime.utcnow()
        new_end = order.return_at or order.date_due
    else:
        new_start = datetime.utcnow()
        new_end = loan_in.date_due
    if new_end is None:
        raise HTTPException(status_code=400, detail="Chybí datum konce výpůjčky.")
    # 3a) Zabránit duplicitě v rámci stejné zakázky (aktivní)
    if order is not None:
        dup = (
            db.query(Loan)
            .filter(Loan.order_id == order.id, Loan.item_id == item.id, Loan.date_in.is_(None))
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail="Položka už je v této zakázce.")
    # Překryv je, pokud (existing_start < new_end) AND (existing_end > new_start)
    # Použijeme logistické okno existujících výpůjček přes navázanou zakázku:
    # existing_start = COALESCE(Order.depart_at, Loan.date_out)
    # existing_end   = COALESCE(Loan.date_in, Order.return_at, Loan.date_due)
    existing_start = func.coalesce(Order.depart_at, Loan.date_out)
    existing_end = func.coalesce(Loan.date_in, Order.return_at, Loan.date_due)
    q = (
        db.query(Loan)
        .outerjoin(Order, Loan.order_id == Order.id)
        .filter(Loan.item_id == item.id)
    )
    if order is not None:
        q = q.filter(Loan.order_id != order.id)
    conflict = q.filter(existing_start < new_end).filter(existing_end > new_start).first()
    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Položka je rezervovaná/vypůjčená v překrývajícím se termínu.",
        )

    # 4) Provizorně systémový uživatel
    system_user = get_or_create_system_user(db)

    # 5) Vytvořit výpůjčku
    loan = Loan(
        item_id=item.id,
        customer_id=customer.id,
        issued_by=system_user.id,
        date_out=new_start,
        date_due=new_end,
        condition_out=loan_in.condition_out,
        note=loan_in.note,
        order_id=loan_in.order_id,
    )
    db.add(loan)

    # pokud je k zakázce, udržujeme status aspoň OPEN
    if order is not None and order.status != OrderStatus.OPEN:
        order.status = OrderStatus.OPEN

    db.commit()
    db.refresh(loan)
    return loan



@app.get("/loans", response_model=List[LoanOut])
def list_loans(db: Session = Depends(get_db)):
    loans = db.query(Loan).order_by(Loan.date_out.desc()).all()
    return loans


@app.get("/loans/{loan_id}", response_model=LoanOut)
def get_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).get(loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Výpůjčka nenalezena.")
    return loan


@app.patch("/loans/{loan_id}/return", response_model=LoanOut)
def return_loan(
    loan_id: int,
    loan_ret: LoanReturn,
    db: Session = Depends(get_db),
):
    loan = db.query(Loan).get(loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Výpůjčka nenalezena.")

    if loan.date_in is not None:
        raise HTTPException(status_code=400, detail="Výpůjčka už byla vrácena.")

    loan.date_in = datetime.utcnow()
    if loan_ret.condition_in is not None:
        loan.condition_in = loan_ret.condition_in

    # pokud patří do zakázky, zkusíme případně uzavřít zakázku
    if loan.order_id is not None:
        order = loan.order
        if order:
            open_loans = (
                db.query(Loan)
                .filter(Loan.order_id == order.id, Loan.date_in.is_(None))
                .count()
            )
            if open_loans == 0:
                order.status = OrderStatus.CLOSED
                order.date_closed = datetime.utcnow()

    db.commit()
    db.refresh(loan)
    return loan


@app.patch("/loans/{loan_id}/unreturn", response_model=LoanOut)
def unreturn_loan(loan_id: int, db: Session = Depends(get_db)):
    """
    Zruší vrácení výpůjčky (date_in -> NULL), pokud to nevede ke konfliktu.
    """
    loan = db.query(Loan).get(loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Výpůjčka nenalezena.")
    if loan.date_in is None:
        raise HTTPException(status_code=400, detail="Výpůjčka není vrácena.")

    # Kolizní kontrola: nesmí existovat jiná aktivní výpůjčka stejné položky v překryvu
    new_start = loan.date_out
    new_end = loan.date_due
    existing_start = func.coalesce(Order.depart_at, Loan.date_out)
    existing_end = func.coalesce(Loan.date_in, Order.return_at, Loan.date_due)
    conflict = (
        db.query(Loan)
        .outerjoin(Order, Loan.order_id == Order.id)
        .filter(Loan.item_id == loan.item_id)
        .filter(Loan.id != loan.id)
        .filter(existing_start < new_end)
        .filter(existing_end > new_start)
        .filter(Loan.date_in.is_(None))
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Nelze zrušit vrácení – položka má jinou aktivní výpůjčku v překrývajícím se termínu.",
        )

    loan.date_in = None
    loan.condition_in = None

    # Pokud byla zakázka uzavřena automaticky a nyní ji znovu „otevíráme“, přepneme zpět
    if loan.order_id is not None:
        order = loan.order
        if order and order.status == OrderStatus.CLOSED:
            order.status = OrderStatus.OPEN
            order.date_closed = None

    db.commit()
    db.refresh(loan)
    return loan


@app.delete("/loans/{loan_id}", status_code=204)
def delete_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).get(loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Výpůjčka nenalezena.")
    db.delete(loan)
    db.commit()
    return None

# ---------- ORDERS endpointy ----------

@app.post("/orders", response_model=OrderOut)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    customer = db.query(Customer).get(order_in.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")

    # Finalize times and validate logical constraints
    date_out = order_in.date_out or datetime.utcnow()
    date_due = order_in.date_due
    depart_at = order_in.depart_at if order_in.depart_at is not None else date_out
    return_at = order_in.return_at if order_in.return_at is not None else date_due

    if date_due and date_out and date_out > date_due:
        raise HTTPException(status_code=400, detail="Konec akce nemůže být před začátkem akce.")
    if depart_at > date_out:
        raise HTTPException(status_code=400, detail="Odjezd techniky nemůže být po začátku akce.")
    if return_at < date_due:
        raise HTTPException(status_code=400, detail="Návrat techniky nemůže být před koncem akce.")

    order = Order(
        code=order_in.code,
        customer_id=order_in.customer_id,
        date_due=date_due,
        date_out=date_out,
        depart_at=depart_at,
        return_at=return_at,
        event_name=order_in.event_name,
        event_location=order_in.event_location,
        note=order_in.note,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@app.get("/orders", response_model=List[OrderOut])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    return orders

@app.get("/customers/{customer_id}/orders", response_model=List[OrderOut])
def list_customer_orders(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(Customer).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")
    orders = (
        db.query(Order)
        .filter(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return orders


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    return order


@app.put("/orders/{order_id}", response_model=OrderOut)
def update_order(order_id: int, upd: OrderUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    data = upd.dict(exclude_unset=True)
    # Nastavit hodnoty; přímé přiřazení je ok (neřešíme zde kolizní validace – kontrolujeme až při přidávání položek)
    for k, v in data.items():
        setattr(order, k, v)
    # Pokud chybí depart/return, můžeme je udržovat v konzistenci s date_out/date_due
    if "date_out" in data and order.depart_at is None:
        order.depart_at = order.date_out
    if "date_due" in data and order.return_at is None:
        order.return_at = order.date_due
    # Logické ověření konzistence
    if order.date_out is not None and order.date_due is not None:
        if order.date_out > order.date_due:
            raise HTTPException(status_code=400, detail="Konec akce nemůže být před začátkem akce.")
    if order.depart_at is not None and order.date_out is not None:
        if order.depart_at > order.date_out:
            raise HTTPException(status_code=400, detail="Odjezd techniky nemůže být po začátku akce.")
    if order.return_at is not None and order.date_due is not None:
        if order.return_at < order.date_due:
            raise HTTPException(status_code=400, detail="Návrat techniky nemůže být před koncem akce.")
    db.commit()
    db.refresh(order)
    return order


@app.post("/orders/{order_id}/add_item_by_code", response_model=LoanOut)
def add_item_to_order(
    order_id: int,
    payload: OrderAddItem,
    db: Session = Depends(get_db),
):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Zakázka je zrušená.")
    if order.status == OrderStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Zakázka je uzavřená.")

    # match by normalized code to tolerate different dash/whitespace variants
    norm = _normalize_code_py(payload.item_code)
    item = db.query(Item).filter(_normalize_code_sql(Item.code) == norm).first()
    if not item:
        # Pokud položka s tímto kódem (po normalizaci) neexistuje, založíme ji „za běhu“
        cleaned = payload.item_code or ""
        for ch in _DASHES:
            cleaned = cleaned.replace(ch, "-")
        cleaned = cleaned.replace("\u00A0", "").strip()
        if not cleaned:
            raise HTTPException(status_code=400, detail="Prázdný kód položky.")
        # Zkusíme ještě jednou, kdyby existovala pod přesně tímto cleaned kódem
        item = db.query(Item).filter(Item.code == cleaned).first()
        if not item:
            item = Item(
                code=cleaned,
                name=cleaned,
                category=None,
                manufacturer=None,
                serial_number=None,
                location=None,
                condition_note=None,
            )
            db.add(item)
            db.flush()  # získáme id

    # Ověřit, že stejná položka už není v této zakázce (aktivní)
    dup = (
        db.query(Loan)
        .filter(Loan.order_id == order.id, Loan.item_id == item.id, Loan.date_in.is_(None))
        .first()
    )
    if dup:
        raise HTTPException(status_code=400, detail="Položka už je v této zakázce.")

    # Ověřit, že se nekrývá s jinou výpůjčkou/rezervací stejného kusu.
    # Bereme plánované rozmezí nové výpůjčky z termínů zakázky.
    # Blokace podle logistického okna (depart_at → return_at), fallback na date_out/date_due
    new_start = (order.depart_at or order.date_out or datetime.utcnow())
    new_end = (order.return_at or order.date_due)
    new_start = (order.depart_at or order.date_out or datetime.utcnow())
    new_end = (order.return_at or order.date_due)
    # existuje-li konflikt: (loan.date_out < new_end) AND (coalesce(loan.date_in, loan.date_due) > new_start)
    existing_start = func.coalesce(Order.depart_at, Loan.date_out)
    existing_end = func.coalesce(Loan.date_in, Order.return_at, Loan.date_due)
    conflict = (
        db.query(Loan)
        .outerjoin(Order, Loan.order_id == Order.id)
        .filter(Loan.item_id == item.id)
        .filter(Loan.order_id != order.id if True else True)  # jen pro jistotu
        .filter(existing_start < new_end)
        .filter(existing_end > new_start)
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail="Položka je rezervovaná/vypůjčená v překrývajícím se termínu.",
        )

    customer = db.query(Customer).get(order.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník zakázky nenalezen.")

    system_user = get_or_create_system_user(db)

    loan = Loan(
        item_id=item.id,
        customer_id=customer.id,
        issued_by=system_user.id,
        date_out=new_start,
        date_due=new_end,
        condition_out=payload.condition_out,
        note=payload.note,
        order_id=order.id,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@app.get("/orders/{order_id}/loans", response_model=List[LoanOut])
def get_order_loans(order_id: int, active_only: bool = True, db: Session = Depends(get_db)):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    q = db.query(Loan).filter(Loan.order_id == order_id)
    if active_only:
        q = q.filter(Loan.date_in.is_(None))
    loans = q.order_by(Loan.id).all()
    return loans


@app.patch("/orders/{order_id}/close", response_model=OrderOut)
def close_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")

    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Zakázka je zrušená.")
    if order.status == OrderStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Zakázka je již uzavřená.")

    # Automatiky ukončíme všechny aktivní výpůjčky patřící do zakázky
    active_loans = (
        db.query(Loan)
        .filter(Loan.order_id == order.id, Loan.date_in.is_(None))
        .all()
    )
    if active_loans:
        now = datetime.utcnow()
        for loan in active_loans:
            loan.date_in = now
            # nepovinné: nenastavujeme received_by ani condition_in
        db.flush()

    order.status = OrderStatus.CLOSED
    order.date_closed = datetime.utcnow()

    db.commit()
    db.refresh(order)
    return order


@app.delete("/orders/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """
    Smaže zakázku včetně všech jejích výpůjček (cascade).
    """
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    db.delete(order)
    db.commit()
    return None


@app.patch("/orders/{order_id}/reopen", response_model=OrderOut)
def reopen_order(order_id: int, db: Session = Depends(get_db)):
    """
    Znovu otevře uzavřenou zakázku. Nevrací automaticky výpůjčky zpět do aktivního stavu.
    """
    order = db.query(Order).get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Zakázka nenalezena.")
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Zrušenou zakázku nelze znovu otevřít.")
    if order.status != OrderStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Zakázka není uzavřená.")
    order.status = OrderStatus.OPEN
    order.date_closed = None
    db.commit()
    db.refresh(order)
    return order
