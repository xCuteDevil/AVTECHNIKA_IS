// src/App.jsx
import { useEffect, useState, Fragment, useRef, Component } from "react";
import { flushSync } from "react-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    try {
      // eslint-disable-next-line no-console
      console.error("Uncaught UI error:", error, info);
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error || "Unknown error");
      return (
        <div className="min-h-screen bg-slate-900 text-slate-50 p-4">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-xl font-semibold mb-2">Došlo k chybě v aplikaci</h1>
            <div className="text-sm text-slate-300 mb-3">{msg}</div>
            <button
              className="px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
              onClick={() => window.location.reload()}
            >
              Zkusit znovu načíst
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [tab, setTab] = useState("items");

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
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
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    manufacturer: "",
    serial_number: "",
    condition_note: "",
  });
  const [editId, setEditId] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const itemQrRef = useRef(null);
  const [scanStatus, setScanStatus] = useState("");
  const [lastDecoded, setLastDecoded] = useState("");
  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [histories, setHistories] = useState({});

  const parseItemFromQr = (text) => {
    const raw = (text ?? "").trim();
    if (!raw) return {};
    // 1) JSON payload: {"code":"...","name":"...","category":"..."}
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        return {
          code: obj.code ?? undefined,
          name: obj.name ?? undefined,
          category: obj.category ?? undefined,
        };
      }
    } catch {}
    // 2) Pipe-separated: CODE|NAME|CATEGORY
    if (raw.includes("|")) {
      const [code, name, category] = raw.split("|").map((s) => s.trim());
      return { code, name, category };
    }
    // 3) Key-value: code=XXX;name=YYY;category=ZZZ
    if (raw.includes("=")) {
      const out = {};
      raw.split(";").forEach((pair) => {
        const [k, v] = pair.split("=").map((s) => (s || "").trim());
        if (k && v) out[k] = v;
      });
      return {
        code: out.code ?? undefined,
        name: out.name ?? undefined,
        category: out.category ?? undefined,
      };
    }
    // 4) Fallback: celý obsah je kód položky
    return { code: raw };
  };

  const loadItems = async () => {
    const res = await fetch(`${API_BASE}/items`);
    const data = await res.json();
    setItems(data);
  };
  const loadCustomers = async () => {
    const res = await fetch(`${API_BASE}/customers`);
    setCustomers(await res.json());
  };
  const getCustomerName = (id) =>
    customers.find((c) => c.id === id)?.name || `#${id}`;
  const formatDateTime = (s) =>
    s ? new Date(s).toLocaleString("cs-CZ") : "-";
  const loadHistory = async (itemId) => {
    const res = await fetch(`${API_BASE}/items/${itemId}/loans`);
    if (res.ok) {
      const data = await res.json();
      setHistories((h) => ({ ...h, [itemId]: data }));
    }
  };

  useEffect(() => {
    loadItems();
    loadCustomers();
  }, []);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editId ? `${API_BASE}/items/${editId}` : `${API_BASE}/items`;
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
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
      setEditId(null);
      loadItems();
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  const startEdit = (it) => {
    setForm({
      code: it.code || "",
      name: it.name || "",
      category: it.category || "",
      manufacturer: it.manufacturer || "",
      serial_number: it.serial_number || "",
      condition_note: it.condition_note || "",
    });
    setEditId(it.id);
    setScanOpen(false);
    setScanStatus("");
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm({
      code: "",
      name: "",
      category: "",
      manufacturer: "",
      serial_number: "",
      condition_note: "",
    });
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
            const parsed = parseItemFromQr(value);
            console.log("QR decode OK (item):", value, parsed);
            setLastDecoded(value);
            // vynutíme synchronní update hodnot formuláře
            flushSync(() => {
              setForm((f) => ({
                ...f,
                code: parsed.code ?? f.code,
                name: parsed.name ?? f.name,
                category: parsed.category ?? f.category,
              }));
            });
            // fallback přímé propsání do inputu s kódem (pro jistotu)
            if (codeInputRef.current && (parsed.code ?? value)) {
              try { codeInputRef.current.value = parsed.code ?? value; } catch {}
            }
            // rovnou propsat i do názvu/kategorie (pro jistotu na mobilech)
            if (nameInputRef.current && parsed.name) {
              try { nameInputRef.current.value = parsed.name; } catch {}
            }
            if (categoryInputRef.current && parsed.category) {
              try { categoryInputRef.current.value = parsed.category; } catch {}
            }
            setScanStatus(
              `Načteno: ${parsed.code ?? value}${
                parsed.name ? ` • ${parsed.name}` : ""
              }${parsed.category ? ` • ${parsed.category}` : ""}`
            );
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
          ref={nameInputRef}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[160px]"
        />
        <input
          name="category"
          placeholder="Kategorie"
          value={form.category}
          onChange={handleChange}
          ref={categoryInputRef}
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm flex-1 min-w-[120px]"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
        >
          {editId ? "Uložit změny" : "Přidat položku"}
        </button>
        {editId && (
          <button
            type="button"
            onClick={cancelEdit}
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm font-medium"
          >
            Zrušit editaci
          </button>
        )}
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
      <div className="mb-3 text-[11px] text-slate-500 space-x-3">
        <span>Debug – kód: <span className="font-mono">{form.code || "(prázdné)"}</span></span>
        <span>název: <span className="font-mono">{form.name || "(prázdné)"}</span></span>
        <span>kategorie: <span className="font-mono">{form.category || "(prázdné)"}</span></span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800/80">
            <tr>
              <Th>ID</Th>
              <Th>Kód</Th>
              <Th>Název</Th>
              <Th>Kategorie</Th>
              <Th>Součástí</Th>
              <Th>Akce</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <Fragment key={it.id}>
                <tr
                  className="border-t border-slate-800 hover:bg-slate-800/40"
                >
                  <Td>{it.id}</Td>
                  <Td className="font-mono">{it.code}</Td>
                  <Td>{it.name}</Td>
                  <Td>{it.category}</Td>
                <Td>
                <div className="flex flex-wrap gap-1">
                  {(it.accessories || []).map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px]"
                    >
                      {a.name}
                      <button
                        className="text-slate-400 hover:text-rose-400"
                        title="Odebrat"
                        onClick={async () => {
                          if (!confirm(`Odebrat součást „${a.name}“?`)) return;
                          await fetch(`${API_BASE}/items/${it.id}/accessories/${a.id}`, { method: "DELETE" });
                          loadItems();
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[11px] hover:bg-slate-700"
                    onClick={async () => {
                      const name = prompt("Název součásti (např. 230V kabel, dálkový ovladač)");
                      if (!name) return;
                      await fetch(`${API_BASE}/items/${it.id}/accessories`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name }),
                      });
                      loadItems();
                    }}
                  >
                    + přidat
                  </button>
                </div>
                </Td>
                  <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        const next = historyFor === it.id ? null : it.id;
                        setHistoryFor(next);
                        if (next && !histories[it.id]) {
                          await loadHistory(it.id);
                        }
                      }}
                      className="px-3 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-xs font-medium"
                    >
                      Historie
                    </button>
                    <button
                      onClick={() => startEdit(it)}
                      className="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-xs font-medium"
                    >
                      Upravit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Opravdu smazat tuto položku?")) return;
                        const res = await fetch(`${API_BASE}/items/${it.id}`, { method: "DELETE" });
                        if (res.status === 204) {
                          if (editId === it.id) cancelEdit();
                          loadItems();
                        } else {
                          try {
                            const err = await res.json();
                            const msg = String(err.detail || res.statusText || "");
                            if (msg.includes("nelze smazat") || msg.includes("existují výpůjčky")) {
                              if (confirm("Nelze smazat – existují výpůjčky. Chceš položku archivovat?")) {
                                const a = await fetch(`${API_BASE}/items/${it.id}/archive`, { method: "PATCH" });
                                if (a.ok) {
                                  if (editId === it.id) cancelEdit();
                                  loadItems();
                                  return;
                                } else {
                                  try {
                                    const e2 = await a.json();
                                    alert("Archivace selhala: " + (e2.detail || a.statusText));
                                  } catch {
                                    alert("Archivace selhala.");
                                  }
                                  return;
                                }
                              }
                            }
                            alert("Chyba při mazání: " + msg);
                          } catch {
                            alert("Chyba při mazání.");
                          }
                        }
                      }}
                      className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-xs font-medium"
                    >
                      Smazat
                    </button>
                  </div>
                  </Td>
                </tr>
                {historyFor === it.id && (
                  <tr className="bg-slate-900/50">
                    <Td colSpan={6}>
                      <div className="text-xs text-slate-300 mb-2">Historie výpůjček</div>
                      <div className="overflow-x-auto rounded-md border border-slate-800">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-800/70">
                            <tr>
                              <Th>ID</Th>
                              <Th>Zákazník</Th>
                              <Th>Od</Th>
                              <Th>Do</Th>
                              <Th>Vráceno</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {(histories[it.id] || []).map((l) => (
                              <tr key={l.id} className="border-t border-slate-800">
                                <Td>{l.id}</Td>
                                <Td>{getCustomerName(l.customer_id)}</Td>
                                <Td>{formatDateTime(l.date_out)}</Td>
                                <Td>{formatDateTime(l.date_due)}</Td>
                                <Td>{formatDateTime(l.date_in)}</Td>
                              </tr>
                            ))}
                            {(histories[it.id] || []).length === 0 && (
                              <tr>
                                <Td colSpan={5} className="text-center text-slate-400 py-3">
                                  Zatím žádné záznamy.
                                </Td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Td>
                  </tr>
                )}
              </Fragment>
            ))}
            {items.length === 0 && (
              <tr>
                <Td colSpan={6} className="text-center text-slate-400 py-6">
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
              <Th>Kontaktní osoba</Th>
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
          <option value="">– Vyber kontaktní osobu –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.contact_person && c.contact_person.trim().length > 0)
                ? `${c.contact_person} — ${c.name}`
                : c.name}
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
  const [scanInfo, setScanInfo] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    date_due: "",
    date_out: "",
    event_name: "",
    event_location: "",
    note: "",
  });
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [addSearch, setAddSearch] = useState("");

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
      date_out: form.date_out ? form.date_out + "T00:00:00" : null,
      event_name: form.event_name,
      event_location: form.event_location,
      note: form.note,
    };
    const res = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const createdOrder = await res.json();
      // Po vytvoření rovnou rozbalíme detail a na mobilech otevřeme čtečku
      setExpandedOrder(createdOrder.id);

      // pokud jsou vybrané položky, založíme k nim výpůjčky v rámci zakázky
      let createdLoans = 0;
      let failedLoans = [];
      if (selectedItemIds.length > 0) {
        const loanPayloadBase = {
          customer_id: Number(form.customer_id),
          date_due: form.date_due ? form.date_due + "T00:00:00" : null,
          condition_out: "",
          note: "",
          order_id: createdOrder.id,
        };
        for (const itemId of selectedItemIds) {
          try {
            const lr = await fetch(`${API_BASE}/loans`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...loanPayloadBase, item_id: Number(itemId) }),
            });
            if (lr.ok) {
              createdLoans += 1;
            } else {
              let detail = lr.statusText;
              try {
                const ejson = await lr.json();
                detail = ejson.detail || detail;
              } catch {}
              failedLoans.push({ itemId, detail });
            }
          } catch (err) {
            failedLoans.push({ itemId, detail: String(err) });
          }
        }
      }

      setForm({
        customer_id: "",
        date_due: "",
        date_out: "",
        event_name: "",
        event_location: "",
        note: "",
      });
      setSelectedItemIds([]);
      await loadAll();
      // Po načtení seznamu spustíme čtečku pro nově vytvořenou zakázku (pokud je otevřená)
      setScanOrderId(createdOrder.id);
      if (selectedItemIds.length > 0) {
        const details =
          failedLoans
            .slice(0, 6)
            .map((f) => `#${f.itemId}: ${f.detail}`)
            .join("\n") || "";
        alert(
          `Zakázka vytvořena (ID ${createdOrder.id}).\nPoložky: přidáno ${createdLoans}, chyby ${failedLoans.length}${
            details ? `\n${details}` : ""
          }`
        );
      }
    } else {
      const err = await res.json();
      alert("Chyba: " + err.detail);
    }
  };

  const getCustomerName = (id) => {
    const c = customers.find((x) => x.id === id);
    if (!c) return `#${id}`;
    return c.contact_person && c.contact_person.trim().length > 0
      ? `${c.contact_person} — ${c.name}`
      : c.name;
  };
  const getItemName = (id) =>
    items.find((i) => i.id === id)?.name || `#${id}`;
  const getItemCode = (id) =>
    items.find((i) => i.id === id)?.code || `#${id}`;
  const getItemCategory = (id) =>
    items.find((i) => i.id === id)?.category || "-";
  const getItemAccessories = (id) =>
    items.find((i) => i.id === id)?.accessories || [];

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

  const handleDeleteLoan = async (loanId) => {
    if (!confirm("Odebrat tuto položku ze zakázky?")) return;
    const res = await fetch(`${API_BASE}/loans/${loanId}`, { method: "DELETE" });
    if (res.status === 204) {
      if (expandedOrder != null) {
        await loadOrderLoans(expandedOrder);
      }
      await loadAll();
    } else {
      try {
        const err = await res.json();
        alert("Odstranění selhalo: " + (err.detail || res.statusText));
      } catch {
        alert("Odstranění selhalo.");
      }
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

  const safeStopScanner = async () => {
    const cam = qrRef.current;
    if (!cam) return;
    try {
      const state = typeof cam.getState === "function" ? cam.getState() : null;
      // 2 = SCANNING, 1 = PAUSED (html5-qrcode internals)
      if (state === 2 || state === 1) {
        await cam.stop().catch(() => {});
      }
      await cam.clear().catch(() => {});
    } catch (e) {
      console.warn("safeStopScanner:", e);
    } finally {
      qrRef.current = null;
    }
  };

  const handleScanInputChange = (orderId, value) => {
    setScanInputs((prev) => ({ ...prev, [orderId]: value }));
  };

  const parseCodeFromScan = (text) => {
    const raw = (text ?? "").trim();
    if (!raw) return "";
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object" && obj.code) return String(obj.code).trim();
    } catch {}
    // try to find `code=...` or `code: ...` in a tolerant way
    const ci = raw.toLowerCase().indexOf("code");
    if (ci >= 0) {
      const tail = raw.slice(ci);
      const m2 = tail.match(/^code\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i);
      if (m2 && m2[1]) return m2[1];
    }
    // URL form → extract last path segment (without extension)
    if (/^https?:\/\//i.test(raw)) {
      const last = raw.split(/[\/\\]/).pop() || "";
      return last.replace(/\.[a-z0-9]+$/i, "").trim();
    }
    // Relative path like /qr/TV-001.png → take filename without extension
    if (raw.includes("/") && /\.[a-z0-9]+$/i.test(raw)) {
      const last = raw.split(/[\/\\]/).pop() || "";
      return last.replace(/\.[a-z0-9]+$/i, "").trim();
    }
    if (raw.includes("|")) return raw.split("|")[0].trim();
    if (raw.includes(",")) return raw.split(",")[0].trim();
    return (raw.replace(/[^\w-]/g, " ").trim().split(/\s+/)[0] || "");
  };

  const handleAddByCode = async (orderId, codeOverride) => {
    const order = orders.find((x) => x.id === orderId);
    if (!order) {
      setScanInfo("Zakázka nenalezena.");
      return;
    }
    if (order.status !== "OPEN") {
      setScanInfo("Zakázka není otevřená, nelze přidat položku.");
      return;
    }

    let code = codeOverride !== undefined ? parseCodeFromScan(codeOverride) : (scanInputs[order.id] || "").trim();
    if (code) {
      // normalize fancy dashes / NBSP coming from printed QR
      code = code.replace(/[\u2013\u2116\u2014\u2212\u2010\u2011]/g, "-").replace(/\u00A0/g, "").trim();
    }
    if (!code) {
      setScanInfo("Zadej nebo naskenuj kód položky.");
      return;
    }

    console.debug("Adding by code:", { orderId, raw: codeOverride, parsed: code });
    setScanInfo(`Přidávám: ${code}`);
    const res = await fetch(
      `${API_BASE}/orders/${order.id}/add_item_by_code`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_code: code }),
      }
    );
    if (res.ok) {
      console.debug("Add by code OK");
      setScanInfo(`Přidáno: ${code}`);
      setScanInputs((prev) => ({ ...prev, [order.id]: "" }));
      await loadOrderLoans(order.id);
      await loadAll();
    } else {
      let msg = `HTTP ${res.status}`;
      try {
      const err = await res.json();
        if (err && err.detail) msg = err.detail;
      } catch (e) {
        // keep default msg
      }
      console.warn("Add by code failed:", msg);
      setScanInfo(`Chyba při přidání: ${msg}`);
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
      // základní ověření prostředí
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setScanInfo("Kamera není dostupná (potřebuje HTTPS a oprávnění).");
        return;
      }

      setScanInfo("Spouštím čtečku…");
      const mount = document.getElementById(elId);
      if (!mount) {
        setScanInfo("Nelze spustit čtečku – chybí cílový element.");
        setScanOrderId(null);
        return;
      }
      const html5QrCode = new Html5Qrcode(elId, { verbose: true });
      qrRef.current = html5QrCode;

      html5QrCode
        .start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
            formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          },
          async (decodedText /* , decodedResult */) => {
            const currentOrderId = scanOrderId;
            const value = (decodedText ?? "").toString();
            try {
              // zobraz informaci synchronně, než sáhneme na kameru
              flushSync(() => {
                setScanInfo(`Načteno: ${parseCodeFromScan(value) || value}`);
              });
            } catch {}
            // viz iOS workaround v ItemsView: nejprve nechat projít render,
            // až poté bezpečně zastavit a vyčistit kameru
            await new Promise((resolve) =>
              requestAnimationFrame(() => resolve())
            );
            setTimeout(async () => {
              try {
                await safeStopScanner();
              } catch {}
              // zavřít UI skeneru
            setScanOrderId(null);
              // teprve teď zkusit přidat položku
              try {
                if (currentOrderId != null) {
                  await handleAddByCode(currentOrderId, value);
                } else {
                  console.warn("QR decoded but orderId is null, skipping add.");
                }
              } catch (e) {
                console.error("QR success handler error:", e);
                setScanInfo("Chyba při zpracování QR kódu.");
              }
            }, 30);
          },
          // průběžné chybové callbacky při snaze detekovat QR
          (scanErr) => {
            // neděsit uživatele – jen informace, že čtečka běží
            setScanInfo("Čtečka běží, namiř blíž na QR kód…");
          }
        )
        .catch((err) => {
          console.error("QR start error", err);
          setScanInfo("Start čtečky selhal – zkontroluj HTTPS a oprávnění ke kameře.");
          setScanOrderId(null);
        });
    };

    startScanner();

    return () => {
      safeStopScanner();
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
          <option value="">– Vyber kontaktní osobu –</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.contact_person && c.contact_person.trim().length > 0)
                ? `${c.contact_person} — ${c.name}`
                : c.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="date_out"
          value={form.date_out}
          onChange={handleChange}
          required
          className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm"
        />
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

        <div className="w-full" />
        <div className="w-full grid grid-cols-1 gap-3 mt-2">
          <div className="text-sm text-slate-300">Přidat techniku do zakázky</div>
          <div className="flex gap-2 items-center">
        <input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  // prefer exact code match, otherwise první výsledek
                  const norm = (s) =>
                    (s || "")
                      .replace(/\u2013|\u2014|\u2212|\u2010|\u2011/g, "-")
                      .replace(/\u00A0/g, " ")
                      .trim()
                      .toLowerCase();
                  const exact = items.find(
                    (i) => norm(i.code) === norm(addSearch)
                  );
                  const results = items
                    .filter(
                      (i) =>
                        norm(i.code).includes(norm(addSearch)) ||
                        (i.name || "").toLowerCase().includes(norm(addSearch))
                    )
                    .slice(0, 8);
                  const pick = exact || results[0];
                  if (pick && !selectedItemIds.includes(pick.id)) {
                    setSelectedItemIds((prev) => [...prev, pick.id]);
                    setAddSearch("");
                  }
                }
              }}
              placeholder="Vyhledej kód nebo název (Enter přidá)"
              className="flex-1 px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const norm = (s) =>
                  (s || "")
                    .replace(/\u2013|\u2014|\u2212|\u2010|\u2011/g, "-")
                    .replace(/\u00A0/g, " ")
                    .trim()
                    .toLowerCase();
                const exact = items.find(
                  (i) => norm(i.code) === norm(addSearch)
                );
                const results = items
                  .filter(
                    (i) =>
                      norm(i.code).includes(norm(addSearch)) ||
                      (i.name || "").toLowerCase().includes(norm(addSearch))
                  )
                  .slice(0, 8);
                const pick = exact || results[0];
                if (pick && !selectedItemIds.includes(pick.id)) {
                  setSelectedItemIds((prev) => [...prev, pick.id]);
                  setAddSearch("");
                }
              }}
              className="px-3 py-2 rounded-md bg-blue-500 hover:bg-blue-600 text-sm font-medium"
            >
              Přidat
            </button>
          </div>
          {addSearch && (
            <div className="rounded-md border border-slate-800 bg-slate-900/50">
              <ul className="max-h-44 overflow-auto text-sm">
                {items
                  .filter(
                    (i) =>
                      (i.code || "")
                        .replace(/\u2013|\u2014|\u2212|\u2010|\u2011/g, "-")
                        .toLowerCase()
                        .includes(
                          addSearch
                            .replace(/\u2013|\u2014|\u2212|\u2010|\u2011/g, "-")
                            .toLowerCase()
                        ) ||
                      (i.name || "")
                        .toLowerCase()
                        .includes(addSearch.toLowerCase())
                  )
                  .slice(0, 8)
                  .map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedItemIds.includes(i.id)) {
                            setSelectedItemIds((prev) => [...prev, i.id]);
                          }
                          setAddSearch("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-800"
                      >
                        <span className="font-mono text-slate-200">{i.code}</span>{" "}
                        <span className="text-slate-400">— {i.name}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {selectedItemIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedItemIds.map((id) => {
                const it = items.find((x) => x.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs"
                  >
                    <span className="font-mono">{it?.code || `#${id}`}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedItemIds((prev) => prev.filter((x) => x !== id))
                      }
                      className="text-slate-400 hover:text-white"
                      aria-label="Odebrat"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

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
              <Th>Kontaktní osoba</Th>
              <Th>Název akce</Th>
              <Th>Místo akce</Th>
              <Th>Od</Th>
              <Th>Do</Th>
              <Th>Akce</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.id}>
                <tr className="border-t border-slate-800 hover:bg-slate-800/40">
                  <Td>
                    <button
                      className="text-blue-300 hover:underline"
                      onClick={() => toggleOrder(o.id)}
                    >
                      #{o.id}
                    </button>
                  </Td>
                  <Td>{getCustomerName(o.customer_id)}</Td>
                  <Td>{o.event_name || "-"}</Td>
                  <Td>{o.event_location || "-"}</Td>
                  <Td>{formatDateTime(o.date_out)}</Td>
                  <Td>{formatDateTime(o.date_due)}</Td>
                  <Td>
                    <div className="space-y-1">
                      {o.status === "OPEN" ? (
                        <>
                          <button
                            onClick={() => handleClose(o.id)}
                            className="w-full px-3 py-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-xs font-medium"
                          >
                            Uzavřít zakázku
                          </button>
                          <button
                            onClick={() => {
                              setExpandedOrder(o.id);
                              setScanOrderId(o.id);
                            }}
                            className="w-full px-3 py-1 rounded-md bg-indigo-500 hover:bg-indigo-600 text-xs font-medium"
                          >
                            Skenovat (QR) – přidat položky
                          </button>
                          <div className="text-[11px] text-slate-500">
                            výpůjčky přes QR
                          </div>
                        </>
                      ) : null}
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
                    <Td colSpan={8}>
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            value={scanInputs[o.id] || ""}
                            onChange={(e) =>
                              handleScanInputChange(o.id, e.target.value)
                            }
                            placeholder="Naskenuj nebo zadej kód položky"
                            list={`order-codes-${o.id}`}
                            className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm min-w-[220px] flex-1"
                          />
                          <datalist id={`order-codes-${o.id}`}>
                            {(items || [])
                              .filter((it) => {
                                const norm = (s) =>
                                  (s || "")
                                    .replace(/\u2013|\u2014|\u2212|\u2010|\u2011/g, "-")
                                    .replace(/\u00A0/g, " ")
                                    .trim()
                                    .toLowerCase();
                                const q = norm(scanInputs[o.id] || "");
                                if (!q) return true;
                                return (
                                  norm(it.code).includes(q) ||
                                  (it.name || "").toLowerCase().includes(q)
                                );
                              })
                              .slice(0, 20)
                              .map((it) => (
                                <option key={it.id} value={it.code} label={it.name || ""} />
                              ))}
                          </datalist>
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
                              style={{ minHeight: 260 }}
                            />
                            <div className="text-center text-xs text-slate-400 mt-2">
                              Namíř kameru na QR kód položky.
                            </div>
                          </div>
                        )}
                        {scanInfo && (
                          <div className="text-sm text-slate-300">{scanInfo}</div>
                        )}

                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-800/70">
                              <tr>
                                <Th>Kód</Th>
                                <Th>Název</Th>
                                <Th>Kategorie</Th>
                                <Th>Součástí</Th>
                                <Th>Akce</Th>
                              </tr>
                            </thead>
                            <tbody>
                              {(orderLoans[o.id] || []).map((l) => (
                                <tr
                                  key={l.id}
                                  className="border-t border-slate-800"
                                >
                                  <Td className="font-mono">{getItemCode(l.item_id)}</Td>
                                  <Td>{getItemName(l.item_id)}</Td>
                                  <Td>{getItemCategory(l.item_id)}</Td>
                                  <Td>
                                    <div className="flex flex-wrap gap-1">
                                      {getItemAccessories(l.item_id).map((a) => (
                                        <span
                                          key={a.id}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px]"
                                        >
                                          {a.name}
                                        </span>
                                      ))}
                                    </div>
                                  </Td>
                                  <Td>
                                    {o.status === "OPEN" ? (
                                      <button
                                        onClick={() => handleDeleteLoan(l.id)}
                                        className="px-3 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-xs font-medium"
                                      >
                                        Odstranit
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slate-400">(nelze)</span>
                                    )}
                                  </Td>
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
                <Td colSpan={8} className="text-center text-slate-400 py-6">
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
