# main.py
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware


from database import SessionLocal, engine
from models import Base, Item, Customer, Loan, User, UserRole

from datetime import datetime




# Pro SQLite vývoj: vytvoří tabulky, pokud ještě neexistují
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AV Technika IS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
    code: str
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
    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# ---------- Základ ----------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- ITEMS endpointy ----------

@app.post("/items", response_model=ItemOut)
def create_item(item_in: ItemCreate, db: Session = Depends(get_db)):
    existing = db.query(Item).filter(Item.code == item_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Položka s tímto kódem už existuje.")

    item = Item(
        code=item_in.code,
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


@app.get("/items", response_model=List[ItemOut])
def list_items(db: Session = Depends(get_db)):
    items = db.query(Item).all()
    return items


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

    db.delete(customer)
    db.commit()
    return None

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
    # 1) Zkontrolovat, že položka existuje
    item = db.query(Item).get(loan_in.item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Položka nenalezena.")

    # 2) Zkontrolovat, že zákazník existuje
    customer = db.query(Customer).get(loan_in.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Zákazník nenalezen.")

    # 3) Zkontrolovat, že položka není právě vypůjčená
    existing = (
        db.query(Loan)
        .filter(Loan.item_id == loan_in.item_id, Loan.date_in.is_(None))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Položka je již vypůjčená (existuje aktivní výpůjčka).",
        )

    # 4) Provizorně systémový uživatel
    system_user = get_or_create_system_user(db)

    # 5) Vytvořit výpůjčku
    loan = Loan(
        item_id=item.id,
        customer_id=customer.id,
        issued_by=system_user.id,
        date_due=loan_in.date_due,
        condition_out=loan_in.condition_out,
        note=loan_in.note,
    )
    db.add(loan)
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

    db.commit()
    db.refresh(loan)
    return loan
