from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Enum
)
from sqlalchemy.orm import relationship, declarative_base
import enum

class UserRole(str, enum.Enum):
    STAFF = "STAFF"
    ADMIN = "ADMIN"


class OrderStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


Base = declarative_base()


# -----------------------------
# Role uživatele
# -----------------------------
class UserRole(str, enum.Enum):
    STAFF = "STAFF"
    ADMIN = "ADMIN"


# -----------------------------
# Users
# -----------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STAFF)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    issued_loans = relationship("Loan", back_populates="issued_by_user",
                                foreign_keys="Loan.issued_by")
    received_loans = relationship("Loan", back_populates="received_by_user",
                                  foreign_keys="Loan.received_by")


# -----------------------------
# Customers
# -----------------------------
class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    contact_person = Column(String(255))
    email = Column(String(255))
    phone = Column(String(50))
    note = Column(Text)

    loans = relationship("Loan", back_populates="customer")
    orders = relationship("Order", back_populates="customer")  # NOVÉ

# -----------------------------
# Orders (zakázky)
# -----------------------------
class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True)  # volitelný hezký kód, může být None

    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    date_out = Column(DateTime, default=datetime.utcnow)
    date_due = Column(DateTime, nullable=False)
    date_closed = Column(DateTime, nullable=True)
    # Logistické okno blokace techniky
    depart_at = Column(DateTime, nullable=True)   # odjezd techniky
    return_at = Column(DateTime, nullable=True)   # návrat techniky

    event_name = Column(String(255))
    event_location = Column(String(255))
    note = Column(Text)

    status = Column(Enum(OrderStatus), nullable=False, default=OrderStatus.OPEN)

    customer = relationship("Customer", back_populates="orders")
    loans = relationship(
        "Loan",
        back_populates="order",
        cascade="all, delete-orphan",
    )


# -----------------------------
# Items (technika)
# -----------------------------
class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)  # QR / inventární kód
    name = Column(String(255), nullable=False)
    category = Column(String(100))
    manufacturer = Column(String(100))
    serial_number = Column(String(100))
    location = Column(String(100))
    condition_note = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    accessories = relationship("ItemAccessory", back_populates="item",
                               cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="item")


# -----------------------------
# Accessories
# -----------------------------
class ItemAccessory(Base):
    __tablename__ = "item_accessories"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    name = Column(String(255), nullable=False)
    quantity = Column(Integer, default=1)
    is_required = Column(Boolean, default=True)

    item = relationship("Item", back_populates="accessories")


# -----------------------------
# Loans
# -----------------------------
class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    # NOVÉ: vazba na zakázku
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    issued_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    received_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    date_out = Column(DateTime, default=datetime.utcnow)
    date_due = Column(DateTime, nullable=False)
    date_in = Column(DateTime, nullable=True)

    condition_out = Column(Text)
    condition_in = Column(Text)
    note = Column(Text)
    pdf_path = Column(String(255))

    item = relationship("Item", back_populates="loans")
    customer = relationship("Customer", back_populates="loans")

    issued_by_user = relationship("User", foreign_keys=[issued_by],
                                  back_populates="issued_loans")
    received_by_user = relationship("User", foreign_keys=[received_by],
                                    back_populates="received_loans")

    # NOVÉ: vztah k zakázce
    order = relationship("Order", back_populates="loans")
