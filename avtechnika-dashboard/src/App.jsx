import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

const formatDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function App() {
  const [tab, setTab] = useState("items");

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">
          AV Technika – IS výpůjček
        </h1>

        <nav className="flex gap-3 mb-6">
          <TabButton active={tab === "items"} onClick={() => setTab("items")}>
            Technika
          </TabButton>
          <TabButton
            active={tab === "customers"}
            onClick={() => setTab("customers")}
          >
            Zákazníci
          </TabButton>
          <TabButton active={tab === "loans"} onClick={() => setTab("loans")}>
            Výpůjčky
          </TabButton>
        </nav>

        <hr className="border-neutral-700 mb-6" />

        {tab === "items" && <ItemsView />}
        {tab === "customers" && <CustomersView />}
        {tab === "loans" && <LoansView />}
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm font-medium transition
      ${
        active
          ? "bg-blue-500 border-blue-400 text-white shadow"
          : "bg-neutral-800 border-neutral-700 hover:bg-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Technika ---------- */

function ItemsView() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    manufacturer: "",
    serial_number: "",
    location: "",
    condition_note: "",
  });

  const loadItems = async () => {
    const res = await fetch(`${API_BASE}/items`);
    const data = await res.json();
    setItems(data);
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({
        code: "",
        name: "",
        category: "",
        manufacturer: "",
        serial_number: "",
        location: "",
        condition_note: "",
      });
      loadItems();
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Technika</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center bg-neutral-800/80 p-4 rounded-xl border border-neutral-700"
      >
        <Input
          name="code"
          placeholder="Kód (QR)"
          value={form.code}
          onChange={handleChange}
          required
        />
        <Input
          name="name"
          placeholder="Název"
          value={form.name}
          onChange={handleChange}
          required
          className="flex-1 min-w-[160px]"
        />
        <Input
          name="category"
          placeholder="Kategorie"
          value={form.category}
          onChange={handleChange}
        />
        <Input
          name="location"
          placeholder="Umístění"
          value={form.location}
          onChange={handleChange}
        />

        <button
          type="submit"
          className="ml-auto px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm font-semibold"
        >
          Přidat položku
        </button>
      </form>

      <DataTable
        headers={["ID", "Kód", "Název", "Kategorie", "Umístění"]}
        rows={items.map((it) => [
          it.id,
          it.code,
          it.name,
          it.category,
          it.location,
        ])}
      />
    </div>
  );
}

/* ---------- Zákazníci ---------- */

function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    note: "",
  });

  const loadCustomers = async () => {
    const res = await fetch(`${API_BASE}/customers`);
    const data = await res.json();
    setCustomers(data);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        note: "",
      });
      loadCustomers();
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Zákazníci</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center bg-neutral-800/80 p-4 rounded-xl border border-neutral-700"
      >
        <Input
          name="name"
          placeholder="Název firmy / jméno"
          value={form.name}
          onChange={handleChange}
          required
          className="flex-1 min-w-[180px]"
        />
        <Input
          name="contact_person"
          placeholder="Kontaktní osoba"
          value={form.contact_person}
          onChange={handleChange}
        />
        <Input
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
        />
        <Input
          name="phone"
          placeholder="Telefon"
          value={form.phone}
          onChange={handleChange}
        />

        <button
          type="submit"
          className="ml-auto px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm font-semibold"
        >
          Přidat zákazníka
        </button>
      </form>

      <DataTable
        headers={["ID", "Název", "Kontakt", "Email", "Telefon"]}
        rows={customers.map((c) => [
          c.id,
          c.name,
          c.contact_person,
          c.email,
          c.phone,
        ])}
      />
    </div>
  );
}

/* ---------- Výpůjčky ---------- */

function LoansView() {
  const [loans, setLoans] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    item_id: "",
    customer_id: "",
    date_due: "",
    condition_out: "",
    note: "",
  });

  const loadAll = async () => {
    const [loansRes, itemsRes, custRes] = await Promise.all([
      fetch(`${API_BASE}/loans`),
      fetch(`${API_BASE}/items`),
      fetch(`${API_BASE}/customers`),
    ]);
    setLoans(await loansRes.json());
    setItems(await itemsRes.json());
    setCustomers(await custRes.json());
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      item_id: Number(form.item_id),
      customer_id: Number(form.customer_id),
      date_due: form.date_due ? form.date_due + "T00:00:00" : null,
      condition_out: form.condition_out,
      note: form.note,
    };

    const res = await fetch(`${API_BASE}/loans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setForm({
        item_id: "",
        customer_id: "",
        date_due: "",
        condition_out: "",
        note: "",
      });
      loadAll();
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  const handleReturn = async (id) => {
    const res = await fetch(`${API_BASE}/loans/${id}/return`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ condition_in: "Vráceno v pořádku" }),
    });
    if (res.ok) {
      loadAll();
    } else {
      const err = await res.json();
      alert("Chyba při vracení: " + err.detail);
    }
  };

  const getItemName = (id) =>
    items.find((i) => i.id === id)?.name || `#${id}`;
  const getCustomerName = (id) =>
    customers.find((c) => c.id === id)?.name || `#${id}`;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Výpůjčky</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center bg-neutral-800/80 p-4 rounded-xl border border-neutral-700"
      >
        <Select
          name="item_id"
          value={form.item_id}
          onChange={handleChange}
          required
        >
          <option value="">– Vyber položku –</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} – {i.name}
            </option>
          ))}
        </Select>

        <Select
          name="customer_id"
          value={form.customer_id}
          onChange={handleChange}
          required
        >
          <option value="">– Vyber zákazníka –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Input
          type="date"
          name="date_due"
          value={form.date_due}
          onChange={handleChange}
          required
        />

        <Input
          name="condition_out"
          placeholder="Stav při půjčení"
          value={form.condition_out}
          onChange={handleChange}
          className="flex-1 min-w-[160px]"
        />

        <Input
          name="note"
          placeholder="Poznámka"
          value={form.note}
          onChange={handleChange}
          className="flex-1 min-w-[160px]"
        />

        <button
          type="submit"
          className="ml-auto px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm font-semibold"
        >
          Půjčit
        </button>
      </form>

      <div className="overflow-x-auto bg-neutral-900/60 border border-neutral-700 rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-800">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">ID</th>
              <th className="px-3 py-2 text-left font-semibold">Položka</th>
              <th className="px-3 py-2 text-left font-semibold">Zákazník</th>
              <th className="px-3 py-2 text-left font-semibold">Od</th>
              <th className="px-3 py-2 text-left font-semibold">Do</th>
              <th className="px-3 py-2 text-left font-semibold">Vráceno</th>
              <th className="px-3 py-2 text-left font-semibold">Akce</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l, idx) => (
              <tr
                key={l.id}
                className={idx % 2 === 0 ? "bg-neutral-900" : "bg-neutral-900/60"}
              >
                <td className="px-3 py-2">{l.id}</td>
                <td className="px-3 py-2">{getItemName(l.item_id)}</td>
                <td className="px-3 py-2">{getCustomerName(l.customer_id)}</td>
                <td className="px-3 py-2">{formatDateTime(l.date_out)}</td>
                <td className="px-3 py-2">{formatDateTime(l.date_due)}</td>
                <td className="px-3 py-2">{formatDateTime(l.date_in)}</td>
                <td className="px-3 py-2">
                  {l.date_in ? (
                    <span className="text-green-400 text-xs font-semibold">
                      Vráceno
                    </span>
                  ) : (
                    <button
                      onClick={() => handleReturn(l.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold"
                    >
                      Vrátit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- malé pomocné komponenty ---------- */

function Input({ className = "", ...props }) {
  return (
    <input
      {...props}
      className={
        "px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 focus:outline-none focus:border-blue-400 text-sm " +
        className
      }
    />
  );
}

function Select({ className = "", children, ...props }) {
  return (
    <select
      {...props}
      className={
        "px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 focus:outline-none focus:border-blue-400 text-sm " +
        className
      }
    >
      {children}
    </select>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto bg-neutral-900/60 border border-neutral-700 rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-neutral-800">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={idx % 2 === 0 ? "bg-neutral-900" : "bg-neutral-900/60"}
            >
              {row.map((cell, i) => (
                <td key={i} className="px-3 py-2 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
