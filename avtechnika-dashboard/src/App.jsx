// src/App.jsx
import { useEffect, useState, Fragment, useRef } from "react";
import { flushSync } from "react-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

function App() {
  const [tab, setTab] = useState("items");

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            AV Technika – IS výpůjček
          </h1>

          <nav className="flex flex-wrap gap-3 mt-4">
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
            <TabButton
              active={tab === "orders"}
              onClick={() => setTab("orders")}
            >
              Zakázky
            </TabButton>
          </nav>

          <div className="border-b border-slate-700 mt-6" />
        </header>

        {tab === "items" && <ItemsView />}
        {tab === "customers" && <CustomersView />}
        {tab === "loans" && <LoansView />}
        {tab === "orders" && <OrdersView />}
      </div>
    </div>
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      className={
        "px-4 py-2 rounded-full text-sm font-medium transition " +
        (active
          ? "bg-blue-500 text-white shadow"
          : "bg-slate-800 text-slate-200 hover:bg-slate-700")
      }
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- TECHNIKA ---------- */

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
  const [scanOpen, setScanOpen] = useState(false);
  const itemQrRef = useRef(null);
  const [scanStatus, setScanStatus] = useState("");
  const [lastDecoded, setLastDecoded] = useState("");
  const codeInputRef = useRef(null);

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

  useEffect(() => {
    const startScanner = async () => {
      if (itemQrRef.current) {
        await itemQrRef.current.stop().catch(() => {});
        await itemQrRef.current.clear().catch(() => {});
        itemQrRef.current = null;
      }
      if (!scanOpen) return;

      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        alert("Kamera není dostupná (potřebuje HTTPS a povolení).");
        setScanOpen(false);
        return;
      }

      const elId = "qr-reader-item";
      const mount = document.getElementById(elId);
      if (!mount) {
        setScanOpen(false);
        return;
      }

      try {
        setScanStatus("Spouštím čtečku...");
        const qr = new Html5Qrcode(elId, { verbose: true });
        itemQrRef.current = qr;
        await qr.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          async (decodedText) => {
            const value = (decodedText ?? "").trim();
            console.log("QR decode OK (item):", value);
            setLastDecoded(value);
            // vynutíme synchronní update hodnoty pole před zavřením čtečky
            flushSync(() => {
              setForm((f) => ({ ...f, code: value }));
            });
            // fallback přímé propsání do inputu, kdyby se render opozdil
            if (codeInputRef.current) {
              try { codeInputRef.current.value = value; } catch {}
            }
            setScanStatus(`Načteno: ${value}`);
            // počkáme na jeden frame a teprve potom korektně ukončíme čtečku
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            setTimeout(async () => {
              if (itemQrRef.current) {
                await itemQrRef.current.stop().catch(() => {});
                await itemQrRef.current.clear().catch(() => {});
                itemQrRef.current = null;
              }
              setScanOpen(false);
            }, 30);
          },
          (scanErr) => {
            // indikujeme, že kamera běží; při opakovaných pokeusech ukazujeme chybu
            console.warn("QR decode fail (item):", scanErr);
            setScanStatus("Čtečka běží, namiř blíž na QR kód…");
          }
        );
      } catch (err) {
        console.error("QR start error (item)", err);
        alert("Nepodařilo se spustit čtečku. Zkontroluj HTTPS a oprávnění ke kameře.");
        setScanOpen(false);
      }
    };

    startScanner();

    return () => {
      if (itemQrRef.current) {
        itemQrRef.current.stop().catch(() => {});
        itemQrRef.current.clear().catch(() => {});
        itemQrRef.current = null;
      }
    };
  }, [scanOpen]);

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">Technika</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center mb-4"
      >
        <input
          name="code"
          placeholder="Kód (QR)"
          value={form.code}
          onChange={handleChange}
          required
          ref={codeInputRef}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[140px]"
        />
        <button
          type="button"
          onClick={() => {
            setScanStatus("");
            setScanOpen((v) => !v);
          }}
          className="px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-sm font-medium"
        >
          {scanOpen ? "Zavřít čtečku" : "Naskenovat QR"}
        </button>
        <input
          name="name"
          placeholder="Název"
          value={form.name}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />
        <input
          name="category"
          placeholder="Kategorie"
          value={form.category}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[120px]"
        />
        <input
          name="location"
          placeholder="Umístění"
          value={form.location}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[120px]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
        >
          Přidat položku
        </button>
      </form>

      {scanOpen && (
        <div className="mb-4 p-3 rounded-lg border border-slate-800 bg-slate-900">
          <div
            id="qr-reader-item"
            className="w-full max-w-xs mx-auto"
            style={{ minHeight: 260 }}
          />
          <div className="text-center text-xs text-slate-400 mt-2">
            Namíř kameru na QR kód položky.
          </div>
        </div>
      )}
      {scanStatus && (
        <div className="mb-3 text-sm text-emerald-300">{scanStatus}</div>
      )}
      {lastDecoded && (
        <div className="mb-3 text-xs text-slate-300">Poslední QR: {lastDecoded}</div>
      )}
      <div className="mb-3 text-[11px] text-slate-500">
        Debug – hodnota pole: <span className="font-mono">{form.code || "(prázdné)"}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr>
              <Th>ID</Th>
              <Th>Kód</Th>
              <Th>Název</Th>
              <Th>Kategorie</Th>
              <Th>Umístění</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className="border-t border-slate-800 hover:bg-slate-800/40"
              >
                <Td>{it.id}</Td>
                <Td className="font-mono">{it.code}</Td>
                <Td>{it.name}</Td>
                <Td>{it.category}</Td>
                <Td>{it.location}</Td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-center text-slate-400 py-6">
                  Zatím žádné položky.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- ZÁKAZNÍCI ---------- */

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
    <section>
      <h2 className="text-2xl font-semibold mb-4">Zákazníci</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center mb-4"
      >
        <input
          name="name"
          placeholder="Název firmy / jméno"
          value={form.name}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[180px]"
        />
        <input
          name="contact_person"
          placeholder="Kontaktní osoba"
          value={form.contact_person}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />
        <input
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />
        <input
          name="phone"
          placeholder="Telefon"
          value={form.phone}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[140px]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
        >
          Přidat zákazníka
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr>
              <Th>ID</Th>
              <Th>Název</Th>
              <Th>Kontakt</Th>
              <Th>Email</Th>
              <Th>Telefon</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr
                key={c.id}
                className="border-t border-slate-800 hover:bg-slate-800/40"
              >
                <Td>{c.id}</Td>
                <Td>{c.name}</Td>
                <Td>{c.contact_person}</Td>
                <Td>{c.email}</Td>
                <Td>{c.phone}</Td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <Td colSpan={5} className="text-center text-slate-400 py-6">
                  Zatím žádní zákazníci.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- VÝPŮJČKY ---------- */

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
    order_id: "",
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
      order_id: form.order_id ? Number(form.order_id) : null,
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
        order_id: "",
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

  const formatDateTime = (s) =>
    s ? new Date(s).toLocaleString("cs-CZ") : "-";

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">Výpůjčky</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center mb-4"
      >
        <select
          name="item_id"
          value={form.item_id}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm min-w-[180px]"
        >
          <option value="">– Vyber položku –</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} – {i.name}
            </option>
          ))}
        </select>

        <select
          name="customer_id"
          value={form.customer_id}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm min-w-[180px]"
        >
          <option value="">– Vyber zákazníka –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="date_due"
          value={form.date_due}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm"
        />

        <input
          name="condition_out"
          placeholder="Stav při půjčení"
          value={form.condition_out}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />

        <input
          name="note"
          placeholder="Poznámka"
          value={form.note}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />

        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
        >
          Půjčit
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr>
              <Th>ID</Th>
              <Th>Položka</Th>
              <Th>Zákazník</Th>
              <Th>Od</Th>
              <Th>Do</Th>
              <Th>Vráceno</Th>
              <Th>Akce</Th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => (
              <tr
                key={l.id}
                className="border-t border-slate-800 hover:bg-slate-800/40"
              >
                <Td>{l.id}</Td>
                <Td>{getItemName(l.item_id)}</Td>
                <Td>{getCustomerName(l.customer_id)}</Td>
                <Td>{formatDateTime(l.date_out)}</Td>
                <Td>{formatDateTime(l.date_due)}</Td>
                <Td>{formatDateTime(l.date_in)}</Td>
                <Td>
                  {l.date_in ? (
                    <span className="text-emerald-400 text-xs font-medium">
                      Vráceno
                    </span>
                  ) : (
                    <button
                      onClick={() => handleReturn(l.id)}
                      className="px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-xs font-medium"
                    >
                      Vrátit
                    </button>
                  )}
                </Td>
              </tr>
            ))}
            {loans.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center text-slate-400 py-6">
                  Zatím žádné výpůjčky.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- ZAKÁZKY ---------- */

function OrdersView() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderLoans, setOrderLoans] = useState({});
  const [scanInputs, setScanInputs] = useState({});
  const [scanOrderId, setScanOrderId] = useState(null);
  const qrRef = useRef(null);
  const [form, setForm] = useState({
    customer_id: "",
    date_due: "",
    event_name: "",
    event_location: "",
    note: "",
    code: "",
  });

  const loadAll = async () => {
    const [ordersRes, custRes, itemsRes] = await Promise.all([
      fetch(`${API_BASE}/orders`),
      fetch(`${API_BASE}/customers`),
      fetch(`${API_BASE}/items`),
    ]);
    setOrders(await ordersRes.json());
    setCustomers(await custRes.json());
    setItems(await itemsRes.json());
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
      customer_id: Number(form.customer_id),
      date_due: form.date_due ? form.date_due + "T00:00:00" : null,
      event_name: form.event_name,
      event_location: form.event_location,
      note: form.note,
      code: form.code || null,
    };
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setForm({
        customer_id: "",
        date_due: "",
        event_name: "",
        event_location: "",
        note: "",
        code: "",
      });
      loadAll();
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  const getCustomerName = (id) =>
    customers.find((c) => c.id === id)?.name || `#${id}`;
  const getItemName = (id) =>
    items.find((i) => i.id === id)?.name || `#${id}`;

  const formatDateTime = (s) =>
    s ? new Date(s).toLocaleString("cs-CZ") : "-";

  const statusLabels = {
    OPEN: "Otevřená",
    CLOSED: "Uzavřená",
    CANCELLED: "Zrušená",
  };

  const statusColors = {
    OPEN: "text-amber-300",
    CLOSED: "text-emerald-300",
    CANCELLED: "text-rose-300",
  };

  const handleClose = async (id) => {
    const res = await fetch(`${API_BASE}/orders/${id}/close`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      loadAll();
    } else {
      const err = await res.json();
      alert("Chyba při uzavření: " + err.detail);
    }
  };

  const toggleOrder = async (id) => {
    if (expandedOrder === id) {
      setExpandedOrder(null);
      return;
    }
    setExpandedOrder(id);
    if (!orderLoans[id]) {
      await loadOrderLoans(id);
    }
  };

  const loadOrderLoans = async (id) => {
    const res = await fetch(`${API_BASE}/orders/${id}/loans`);
    if (res.ok) {
      const data = await res.json();
      setOrderLoans((prev) => ({ ...prev, [id]: data }));
    }
  };

  const handleScanInputChange = (orderId, value) => {
    setScanInputs((prev) => ({ ...prev, [orderId]: value }));
  };

  const handleAddByCode = async (orderId, codeOverride) => {
    const order = orders.find((x) => x.id === orderId);
    if (!order) {
      alert("Zakázka nenalezena.");
      return;
    }
    if (order.status !== "OPEN") {
      alert("Zakázka není otevřená, nelze přidat položku.");
      return;
    }

    const code =
      (codeOverride !== undefined
        ? codeOverride
        : scanInputs[order.id] || ""
      ).trim();
    if (!code) {
      alert("Zadej nebo naskenuj kód položky.");
      return;
    }

    const res = await fetch(
      `${API_BASE}/orders/${order.id}/add_item_by_code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_code: code }),
      }
    );
    if (res.ok) {
      setScanInputs((prev) => ({ ...prev, [order.id]: "" }));
      await loadOrderLoans(order.id);
      await loadAll();
    } else {
      const err = await res.json();
      alert("Chyba při přidání: " + err.detail);
    }
  };

  useEffect(() => {
    const startScanner = async () => {
      // stop případné předchozí instance
      if (qrRef.current) {
        await qrRef.current.stop().catch(() => {});
        await qrRef.current.clear().catch(() => {});
        qrRef.current = null;
      }

      if (scanOrderId === null) {
        return;
      }

      const elId = `qr-reader-${scanOrderId}`;
      const html5QrCode = new Html5Qrcode(elId);
      qrRef.current = html5QrCode;

      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            await handleAddByCode(scanOrderId, decodedText);
            setScanOrderId(null);
          }
        )
        .catch((err) => {
          console.error("QR start error", err);
          alert(
            "Nepodařilo se spustit čtečku. Zkontroluj oprávnění ke kameře."
          );
          setScanOrderId(null);
        });
    };

    startScanner();

    return () => {
      if (qrRef.current) {
        qrRef.current.stop().catch(() => {});
        qrRef.current.clear().catch(() => {});
        qrRef.current = null;
      }
    };
  }, [scanOrderId, orders]);

  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">Zakázky</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center mb-4"
      >
        <select
          name="customer_id"
          value={form.customer_id}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm min-w-[180px]"
        >
          <option value="">– Vyber zákazníka –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="date_due"
          value={form.date_due}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm"
        />

        <input
          name="event_name"
          placeholder="Název akce"
          value={form.event_name}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />

        <input
          name="event_location"
          placeholder="Místo akce"
          value={form.event_location}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />

        <input
          name="code"
          placeholder="Kód zakázky (např. 2025-001)"
          value={form.code}
          onChange={handleChange}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />

        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
        >
          Vytvořit zakázku
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr>
              <Th>ID</Th>
              <Th>Kód</Th>
              <Th>Zákazník</Th>
              <Th>Vytvořeno</Th>
              <Th>Do</Th>
              <Th>Akce</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.id}>
                <tr className="border-t border-slate-800 hover:bg-slate-800/40">
                  <Td>{o.id}</Td>
                  <Td className="font-mono">
                    <button
                      className="text-blue-300 hover:underline"
                      onClick={() => toggleOrder(o.id)}
                    >
                      {o.code || "-"}
                    </button>
                  </Td>
                  <Td>{getCustomerName(o.customer_id)}</Td>
                  <Td>{formatDateTime(o.created_at)}</Td>
                  <Td>{formatDateTime(o.date_due)}</Td>
                  <Td>
                    <div className="space-y-1">
                      {o.status === "OPEN" ? (
                        <button
                          onClick={() => handleClose(o.id)}
                          className="px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-xs font-medium"
                        >
                          Uzavřít zakázku
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">(nelze)</span>
                      )}
                      <div className="text-[11px] text-slate-500">
                        výpůjčky přes QR
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span
                      className={`text-xs font-semibold ${
                        statusColors[o.status] || ""
                      }`}
                    >
                      {statusLabels[o.status] || o.status}
                    </span>
                  </Td>
                </tr>

                {expandedOrder === o.id && (
                  <tr className="border-t border-slate-800 bg-slate-900/60">
                    <Td colSpan={7}>
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            value={scanInputs[o.id] || ""}
                            onChange={(e) =>
                              handleScanInputChange(o.id, e.target.value)
                            }
                            placeholder="Naskenuj nebo zadej kód položky"
                            className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm min-w-[220px] flex-1"
                          />
                          <button
                            onClick={() => handleAddByCode(o.id)}
                            className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
                            disabled={o.status !== "OPEN"}
                          >
                            Přidat do zakázky
                          </button>
                          {o.status !== "OPEN" && (
                            <span className="text-xs text-slate-400">
                              Přidávání není možné – zakázka není otevřená.
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => {
                              if (o.status !== "OPEN") return;
                              setScanOrderId(
                                scanOrderId === o.id ? null : o.id
                              );
                            }}
                            className="px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-sm font-medium disabled:opacity-50"
                            disabled={o.status !== "OPEN"}
                          >
                            {scanOrderId === o.id
                              ? "Zavřít čtečku"
                              : "Otevřít čtečku QR"}
                          </button>
                          {scanOrderId !== o.id && (
                            <span className="text-xs text-slate-400">
                              Otevře kameru telefonu pro čtení QR kódu položky.
                            </span>
                          )}
                        </div>

                        {scanOrderId === o.id && (
                          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900">
                            <div
                              id={`qr-reader-${o.id}`}
                              className="w-full max-w-xs mx-auto"
                            />
                            <div className="text-center text-xs text-slate-400 mt-2">
                              Namíř kameru na QR kód položky.
                            </div>
                          </div>
                        )}

                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-800/70">
                              <tr>
                                <Th>ID výpůjčky</Th>
                                <Th>Položka</Th>
                                <Th>Od</Th>
                                <Th>Do</Th>
                                <Th>Vráceno</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {(orderLoans[o.id] || []).map((l) => (
                                <tr
                                  key={l.id}
                                  className="border-t border-slate-800"
                                >
                                  <Td>{l.id}</Td>
                                  <Td>{getItemName(l.item_id)}</Td>
                                  <Td>{formatDateTime(l.date_out)}</Td>
                                  <Td>{formatDateTime(l.date_due)}</Td>
                                  <Td>{formatDateTime(l.date_in)}</Td>
                                </tr>
                              ))}
                              {(orderLoans[o.id] || []).length === 0 && (
                                <tr>
                                  <Td
                                    colSpan={5}
                                    className="text-center text-slate-400 py-4"
                                  >
                                    Zatím žádné položky v zakázce.
                                  </Td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </Td>
                  </tr>
                )}
              </Fragment>
            ))}
            {orders.length === 0 && (
              <tr>
                <Td colSpan={7} className="text-center text-slate-400 py-6">
                  Zatím žádné zakázky.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- tabulkové buňky ---------- */

function Th({ children }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
      {children}
    </th>
  );
}

function Td({ children, className = "", ...rest }) {
  return (
    <td
      className={`px-4 py-2 align-top text-sm text-slate-100 ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}

export default App;
