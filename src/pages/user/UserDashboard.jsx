import React, { useState, useEffect } from "react";
import api from "../../api";

const UPI_APPS = [
  { id: "phonepe", label: "PhonePe", emoji: "📱" },
  { id: "googlepay", label: "Google Pay", emoji: "🟢" },
  { id: "paytm", label: "Paytm", emoji: "🔵" },
  { id: "other", label: "Other UPI App", emoji: "💳" },
];

// ── NEW: payment field validators ──

// Strips spaces/hyphens, checks 13-19 digits (covers Visa/Mastercard/Amex/RuPay etc.)
function getCardNumberError(number) {
  const digitsOnly = (number || "").replace(/[\s-]/g, "");
  if (!digitsOnly) return "Card number is required.";
  if (!/^\d+$/.test(digitsOnly)) return "Card number must contain digits only.";
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return "Card number must be 13-19 digits.";
  }
  return null;
}

// Letters and spaces only (allows names like "O'Brien" / hyphenated surnames)
function getCardNameError(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "Name on card is required.";
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) {
    return "Name can only contain letters, spaces, and ' . -";
  }
  return null;
}

// MM/YY format, valid month, not expired
function getExpiryError(expiry) {
  const trimmed = (expiry || "").trim();
  if (!trimmed) return "Expiry date is required.";

  const match = /^(\d{2})\/(\d{2})$/.exec(trimmed);
  if (!match) return "Expiry must be in MM/YY format.";

  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10) + 2000;

  if (month < 1 || month > 12) return "Expiry month must be between 01 and 12.";

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return "This card has expired.";
  }

  return null;
}

// 3-4 digit CVV (4 for Amex-style cards)
function getCvvError(cvv) {
  const trimmed = (cvv || "").trim();
  if (!trimmed) return "CVV is required.";
  if (!/^\d{3,4}$/.test(trimmed)) return "CVV must be 3 or 4 digits.";
  return null;
}

// username@handle — letters/numbers/./-/_ before @, handle after
const UPI_ID_REGEX = /^[A-Za-z0-9.\-_]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/;

function getUpiIdError(upiId) {
  const trimmed = (upiId || "").trim();
  if (!trimmed) return "UPI ID is required.";
  if (/\s/.test(trimmed)) return "UPI ID cannot contain spaces.";
  if ((trimmed.match(/@/g) || []).length !== 1) {
    return "UPI ID must contain exactly one '@'.";
  }
  if (!UPI_ID_REGEX.test(trimmed)) {
    return "Enter a valid UPI ID, e.g. name@okhdfcbank";
  }
  return null;
}

const UserDashboard = ({ onLogout }) => {
  const currentUser =
    JSON.parse(localStorage.getItem("currentUser")) || {};

  // ── NEW: which sidebar section is showing ──
  const [active, setActive] = useState("dashboard");

  // view now only controls the shop-browsing flow, nested under "Nearby Shops"
  const [view, setView] = useState("location"); // location | products | payment | success

  const [locationSearch, setLocationSearch] = useState("");
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);

  const [productSearch, setProductSearch] = useState("");
  const [shopProducts, setShopProducts] = useState([]);

  const [cart, setCart] = useState([]);

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [cardDetails, setCardDetails] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
  });
  const [upiId, setUpiId] = useState("");
  const [upiApp, setUpiApp] = useState("phonepe");
  const [lastOrder, setLastOrder] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0);

  // ── NEW: snapshot of cart items at the moment the order was placed,
  // used to render the bill receipt even if the backend response shape varies ──
  const [receiptItems, setReceiptItems] = useState([]);

  // ── NEW: live validation error messages for the payment fields ──
  const [paymentErrors, setPaymentErrors] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
    upiId: "",
  });

  // ── NEW: this buyer's own orders, for My Orders / Order History ──
  const [myOrders, setMyOrders] = useState([]);

  // ── NEW: notifications for this buyer (e.g. order status updates) ──
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadShops();
    loadMyOrders();
    loadNotifications();
  }, []);

  const loadShops = async () => {
    try {
      // Pulls only verified shops straight from MongoDB
      const verifiedShops = await api.getShops("?verified=true");
      setShops(
        verifiedShops.map((s) => ({
          email: s.ownerEmail,
          ownerName: s.name,
          phone: s.phone,
          shopName: s.shopName,
          address: s.address,
          verified: s.verified,
        }))
      );
    } catch (err) {
      console.error("Failed to load shops:", err.message);
    }
  };

  // ── load orders placed by this buyer (used for My Orders / History) ──
  const loadMyOrders = async () => {
    try {
      const orders = await api.getMyOrders();
      setMyOrders(
        orders.map((o) => ({
          id: o._id,
          shopName: o.shopName,
          total: o.total,
          paymentLabel: o.paymentMethod === "card" ? "Card" : "UPI",
          status: o.status,
          items: o.items,
          createdAt: o.createdAt,
        }))
      );
    } catch (err) {
      console.error("Failed to load my orders:", err.message);
    }
  };

  // ── NEW: load notifications for this buyer (e.g. "order accepted") ──
  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch (err) {
      console.error("Failed to load notifications:", err.message);
    }
  };

  const filteredShops = locationSearch.trim()
    ? shops.filter((s) => {
        const search = locationSearch.trim().toLowerCase();
        return (
          s.address.toLowerCase().includes(search) ||
          s.shopName.toLowerCase().includes(search)
        );
      })
    : [];

  const selectShop = async (shop) => {
    setSelectedShop(shop);

    try {
      // Loads this shop's products straight from MongoDB
      const products = await api.getProductsByShop(shop.email);
      setShopProducts(products);
    } catch (err) {
      console.error("Failed to load shop products:", err.message);
      setShopProducts([]);
    }

    setProductSearch("");
    setView("products");
  };

  const filteredProducts = shopProducts.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addToCart = (item) => {
    setCart([...cart, item]);
  };

  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );

  const goToPayment = () => {
    if (cart.length === 0) {
      alert("Your cart is empty. Add a product first.");
      return;
    }
    setView("payment");
  };

  const handleCardChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    // ── NEW: light auto-formatting as the user types ──
    if (name === "number") {
      // digits only, max 19, grouped in 4s for readability
      nextValue = value
        .replace(/\D/g, "")
        .slice(0, 19)
        .replace(/(.{4})/g, "$1 ")
        .trim();
    } else if (name === "expiry") {
      // digits only, auto-insert "/" after MM
      const digits = value.replace(/\D/g, "").slice(0, 4);
      nextValue = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    } else if (name === "cvv") {
      nextValue = value.replace(/\D/g, "").slice(0, 4);
    }

    setCardDetails((prev) => ({ ...prev, [name]: nextValue }));

    // ── NEW: live validation per field ──
    const validators = {
      number: getCardNumberError,
      name: getCardNameError,
      expiry: getExpiryError,
      cvv: getCvvError,
    };
    if (validators[name]) {
      setPaymentErrors((prev) => ({ ...prev, [name]: validators[name](nextValue) || "" }));
    }
  };

  // ── NEW: UPI ID change handler with live validation ──
  const handleUpiIdChange = (e) => {
    const value = e.target.value;
    setUpiId(value);
    setPaymentErrors((prev) => ({ ...prev, upiId: getUpiIdError(value) || "" }));
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }

    if (paymentMethod === "card") {
      // ── NEW: run full validation on every card field before submitting ──
      const numberError = getCardNumberError(cardDetails.number);
      const nameError = getCardNameError(cardDetails.name);
      const expiryError = getExpiryError(cardDetails.expiry);
      const cvvError = getCvvError(cardDetails.cvv);

      setPaymentErrors((prev) => ({
        ...prev,
        number: numberError || "",
        name: nameError || "",
        expiry: expiryError || "",
        cvv: cvvError || "",
      }));

      if (numberError || nameError || expiryError || cvvError) {
        alert("Please fix the highlighted card details before continuing.");
        return;
      }
    } else if (paymentMethod === "upi") {
      // ── NEW: run full validation on the UPI ID before submitting ──
      const upiIdError = getUpiIdError(upiId);
      setPaymentErrors((prev) => ({ ...prev, upiId: upiIdError || "" }));

      if (upiIdError) {
        alert("Please enter a valid UPI ID before continuing.");
        return;
      }
    } else if (paymentMethod === "cod") {
      // NOTE: the backend's Order model currently only accepts "card" or
      // "upi" as paymentMethod (Cash on Delivery isn't supported there yet).
      alert(
        "Cash on Delivery isn't supported by the backend yet — please choose Card or UPI, or ask your backend dev to add \"cod\" to the Order model's paymentMethod enum."
      );
      return;
    }

    const paymentLabel =
      paymentMethod === "card"
        ? "Card"
        : `${UPI_APPS.find((a) => a.id === upiApp)?.label || "UPI"} (UPI)`;

    const hasDelivery = cart.some((item) => item.delivery);

    try {
      // Saves the order in MongoDB
      const res = await api.placeOrder({
        shopEmail: selectedShop.email,
        shopName: selectedShop.shopName,
        items: cart.map((item) => ({
          productId: item._id,
          name: item.name,
          price: item.price,
        })),
        paymentMethod,
      });

      setOrderTotal(cartTotal);
      // ── NEW: snapshot the items actually ordered, for the receipt ──
      setReceiptItems(cart.map((item) => ({ name: item.name, price: item.price })));
      setLastOrder({
        ...res.order,
        paymentLabel,
        deliveryAvailable: hasDelivery,
      });
      setView("success");
      loadMyOrders(); // refresh My Orders / History from the database
    } catch (err) {
      alert(err.message || "Failed to place order. Please try again.");
    }
  };

  const startNewOrder = () => {
    setCart([]);
    setSelectedShop(null);
    setShopProducts([]);
    setLocationSearch("");
    setProductSearch("");
    setPaymentMethod("card");
    setCardDetails({ number: "", name: "", expiry: "", cvv: "" });
    setUpiId("");
    setUpiApp("phonepe");
    setLastOrder(null);
    setReceiptItems([]);
    setPaymentErrors({ number: "", name: "", expiry: "", cvv: "", upiId: "" });
    setView("location");
    loadShops();
  };

  // ── NEW: opens a clean, printable bill receipt in a new window ──
  // (the browser's "Print" dialog lets the user Save as PDF too)
  const printReceipt = () => {
    const orderId = lastOrder?._id || lastOrder?.id || "—";
    const orderDate = lastOrder?.createdAt
      ? new Date(lastOrder.createdAt)
      : new Date();

    const itemsHtml = receiptItems
      .map(
        (item) => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.name}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">₹${item.price}</td>
          </tr>`
      )
      .join("");

    const receiptWindow = window.open("", "_blank", "width=420,height=650");
    if (!receiptWindow) {
      alert("Please allow pop-ups to view/print the receipt.");
      return;
    }

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${orderId}</title>
          <style>
            * { box-sizing:border-box; }
            body {
              font-family: 'Courier New', monospace;
              padding: 24px;
              color: #111827;
              max-width: 380px;
              margin: 0 auto;
            }
            h1 { font-size: 20px; text-align:center; margin-bottom: 4px; }
            .sub { text-align:center; color:#666; font-size:12px; margin-bottom:20px; }
            .row { display:flex; justify-content:space-between; font-size:13px; margin:4px 0; }
            hr { border:none; border-top: 1px dashed #999; margin: 14px 0; }
            table { width:100%; border-collapse:collapse; font-size:13px; }
            .total-row { display:flex; justify-content:space-between; font-size:16px; font-weight:bold; margin-top:10px; }
            .footer { text-align:center; font-size:12px; color:#666; margin-top:20px; }
          </style>
        </head>
        <body>
          <h1>🏪 NearbyHub</h1>
          <p class="sub">Payment Receipt</p>

          <div class="row"><span>Order ID</span><span>${orderId}</span></div>
          <div class="row"><span>Date</span><span>${orderDate.toLocaleString()}</span></div>
          <div class="row"><span>Shop</span><span>${lastOrder?.shopName || selectedShop?.shopName || "—"}</span></div>
          <div class="row"><span>Payment Method</span><span>${lastOrder?.paymentLabel || "—"}</span></div>

          <hr />

          <table>
            <tbody>${itemsHtml}</tbody>
          </table>

          <hr />

          <div class="total-row"><span>Total Paid</span><span>₹${orderTotal}</span></div>

          <p class="footer">
            ${
              lastOrder?.deliveryAvailable
                ? "🚚 Delivery available for this order"
                : "🏃 Pickup only — no delivery for this order"
            }
            <br/>Thank you for shopping with NearbyHub!
          </p>

          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  const navItems = [
    { icon: "📊", label: "Dashboard", key: "dashboard" },
    { icon: "🧾", label: "My Orders", key: "myOrders" },
    { icon: "📜", label: "Order History", key: "orderHistory" },
    { icon: "🏪", label: "Nearby Shops", key: "nearbyShops" },
    { icon: "🔔", label: "Notifications", key: "notifications" },
    { icon: "👤", label: "Profile", key: "profile" },
    { icon: "⚙️", label: "Settings", key: "settings" },
  ];

  const currentTab = navItems.find((n) => n.key === active) || navItems[0];

  // active (non-completed) orders vs history
  const activeOrders = myOrders.filter((o) => o.status !== "Delivered");
  const pastOrders = myOrders.filter((o) => o.status === "Delivered");

  return (
    <>
      <style>{`
        *{
          margin:0;
          padding:0;
          box-sizing:border-box;
          font-family:Inter,sans-serif;
        }
        .dash-layout{
          display:flex;
          min-height:100vh;
          background:#f1f5f9;
        }
        .dash-sidebar{
          width:280px;
          background:#111827;
          color:white;
          padding:30px;
          display:flex;
          flex-direction:column;
          justify-content:space-between;
        }
        .logo{
          font-size:32px;
          font-weight:800;
          margin-bottom:40px;
        }
        .logo span{ color:#10b981; }
        .sidebar-user{
          display:flex;
          gap:15px;
          align-items:center;
          background:#1f2937;
          padding:18px;
          border-radius:18px;
          margin-bottom:35px;
        }
        .avatar{
          width:60px;
          height:60px;
          border-radius:50%;
          background:linear-gradient(135deg,#43cea2,#185a9d);
          display:flex;
          justify-content:center;
          align-items:center;
          font-size:22px;
        }
        .sidebar-link{
          width:100%;
          padding:15px;
          border:none;
          border-radius:14px;
          background:none;
          color:white;
          text-align:left;
          margin-bottom:10px;
          cursor:pointer;
        }
        .sidebar-link.active{
          background:linear-gradient(135deg,#43cea2,#185a9d);
        }
        .logout-btn{
          background:#ef4444;
          color:white;
          border:none;
          padding:15px;
          border-radius:14px;
          cursor:pointer;
        }
        .dash-main{ flex:1; padding:35px; }
        .topbar{
          background:white;
          padding:30px;
          border-radius:20px;
          margin-bottom:30px;
        }
        .table-box{
          background:white;
          padding:30px;
          border-radius:20px;
        }
        .search{
          width:100%;
          padding:12px;
          margin-bottom:20px;
          border-radius:8px;
          border:1px solid #ddd;
          box-sizing:border-box;
          font-size:16px;
        }
        .input{
          width:100%;
          padding:12px;
          margin-bottom:12px;
          border-radius:8px;
          border:1px solid #ddd;
          box-sizing:border-box;
          font-size:16px;
        }
        .grid{
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
          gap:20px;
          margin-bottom:20px;
        }
        .product{
          background:white;
          padding:15px;
          border-radius:10px;
          text-align:center;
          box-shadow:0 5px 10px rgba(0,0,0,.08);
        }
        .shop-card{
          background:white;
          padding:20px;
          border-radius:10px;
          box-shadow:0 5px 10px rgba(0,0,0,.08);
        }
        .shop-header-card{
          background:white;
          padding:18px 20px;
          border-radius:10px;
          margin-bottom:15px;
          box-shadow:0 5px 10px rgba(0,0,0,.08);
        }
        .shop-name{ margin:0 0 8px 0; color:#185a9d; }
        .shop-detail{ color:#555; margin:4px 0; font-size:14px; }
        .price-text{ font-weight:bold; font-size:16px; }
        .image{
          width:100%;
          border-radius:10px;
          margin-bottom:10px;
        }
        .btn{
          width:100%;
          background:#43cea2;
          color:white;
          padding:12px;
          border:none;
          border-radius:6px;
          cursor:pointer;
          font-weight:bold;
          margin-top:10px;
        }
        .back-btn{
          background:#f3f4f6;
          color:#185a9d;
          padding:10px 16px;
          border:none;
          border-radius:6px;
          cursor:pointer;
          font-weight:bold;
          margin-bottom:15px;
        }
        .remove-btn{
          background:#ef4444;
          color:white;
          border:none;
          border-radius:4px;
          width:26px;
          height:26px;
          cursor:pointer;
          font-weight:bold;
        }
        .card{
          margin-top:20px;
          background:#fafafa;
          padding:20px;
          border-radius:10px;
        }
        .success-card{
          margin-top:30px;
          background:#f0fdf4;
          border:1px solid #bbf7d0;
          padding:40px;
          border-radius:15px;
          max-width:450px;
          margin-left:auto;
          margin-right:auto;
          text-align:center;
        }
        .success-msg{
          color:#16a34a;
          font-size:20px;
          font-weight:bold;
          margin-bottom:15px;
        }
        .cart-row{
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:8px 0;
          border-bottom:1px solid #eee;
        }
        .cart-total{ margin-top:12px; font-size:18px; }
        .empty-text{ color:#6b7280; grid-column:1/-1; text-align:center; }
        .toggle-row{ display:flex; gap:10px; margin-bottom:15px; }
        .toggle-btn{
          flex:1;
          padding:12px;
          border-radius:8px;
          border:1px solid #ddd;
          background:#f3f4f6;
          cursor:pointer;
          font-weight:bold;
        }
        .toggle-btn-active{
          flex:1;
          padding:12px;
          border-radius:8px;
          border:1px solid #43cea2;
          background:#43cea2;
          color:white;
          cursor:pointer;
          font-weight:bold;
        }
        .cod-note{
          background:#fef9c3;
          border:1px solid #fde68a;
          border-radius:8px;
          padding:14px;
          color:#854d0e;
          font-weight:600;
          text-align:center;
          margin-bottom:10px;
        }
        .upi-app-row{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:15px; }
        .upi-app-btn{
          flex:1 1 120px;
          padding:10px;
          border-radius:8px;
          border:1px solid #ddd;
          background:#f3f4f6;
          cursor:pointer;
          font-weight:bold;
        }
        .upi-app-btn-active{
          flex:1 1 120px;
          padding:10px;
          border-radius:8px;
          border:1px solid #185a9d;
          background:#185a9d;
          color:white;
          cursor:pointer;
          font-weight:bold;
        }
        .input.input-error{
          border-color:#ef4444;
          background:#fef2f2;
        }
        .field-error-msg{
          margin:-8px 0 12px 0;
          font-size:12.5px;
          color:#ef4444;
          font-weight:600;
        }
        .receipt-box{
          background:white;
          border:1px dashed #bbf7d0;
          border-radius:10px;
          padding:20px;
          margin-top:10px;
          text-align:left;
        }
        .receipt-row{
          display:flex;
          justify-content:space-between;
          font-size:14px;
          color:#374151;
          margin:6px 0;
        }
        .receipt-divider{
          border:none;
          border-top:1px dashed #d1d5db;
          margin:12px 0;
        }
        .receipt-total-row{
          display:flex;
          justify-content:space-between;
          font-size:18px;
          font-weight:bold;
          color:#111827;
          margin-top:8px;
        }
      `}</style>

      <div className="dash-layout">
        <aside className="dash-sidebar">
          <div>
            <div className="logo">
              Nearby<span>Hub</span>
            </div>

            <div className="sidebar-user">
              <div className="avatar">{currentUser.name?.charAt(0)}</div>
              <div>
                <h4>{currentUser.name}</h4>
                <p>Customer</p>
              </div>
            </div>

            {navItems.map((item) => (
              <button
                key={item.key}
                className={`sidebar-link ${
                  active === item.key ? "active" : ""
                }`}
                onClick={() => setActive(item.key)}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>

          <button className="logout-btn" onClick={() => onLogout?.()}>
            🚪 Logout
          </button>
        </aside>

        <div className="dash-main">
          <div className="topbar">
            <h1>
              {currentTab.icon} {currentTab.label}
            </h1>
            <p>Welcome back, {currentUser.name}</p>
          </div>

          {active === "dashboard" && (
            <div className="table-box">
              <h2>Overview</h2>
              <p style={{ marginTop: 12 }}>Total Orders: {myOrders.length}</p>
              <p>Active Orders: {activeOrders.length}</p>
              <p>Completed Orders: {pastOrders.length}</p>
            </div>
          )}

          {active === "myOrders" && (
            <div className="table-box">
              <h2>My Orders</h2>
              {activeOrders.length === 0 ? (
                <p>You have no active orders right now.</p>
              ) : (
                <div className="grid">
                  {activeOrders.map((order) => (
                    <div key={order.id} className="product">
                      <h3>{order.shopName}</h3>
                      <p><strong>Total: ₹{order.total}</strong></p>
                      <p><strong>Payment:</strong> {order.paymentLabel}</p>
                      <p><strong>Status:</strong> {order.status}</p>
                      <div style={{ textAlign: "left", marginTop: 10 }}>
                        {order.items.map((item, i) => (
                          <p key={i} style={{ fontSize: 14, margin: "2px 0" }}>
                            • {item.name} — ₹{item.price}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {active === "orderHistory" && (
            <div className="table-box">
              <h2>Order History</h2>
              {myOrders.length === 0 ? (
                <p>No orders placed yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 12 }}>Shop</th>
                      <th style={{ textAlign: "left", padding: 12 }}>Total</th>
                      <th style={{ textAlign: "left", padding: 12 }}>Payment</th>
                      <th style={{ textAlign: "left", padding: 12 }}>Status</th>
                      <th style={{ textAlign: "left", padding: 12 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myOrders.map((order) => (
                      <tr key={order.id}>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{order.shopName}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>₹{order.total}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{order.paymentLabel}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{order.status}</td>
                        <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {active === "nearbyShops" && (
            <div className="table-box">
              {/* ---------------- STEP 1: LOCATION -> SHOPS ---------------- */}
              {view === "location" && (
                <>
                  <input
                    placeholder="Enter your location (e.g. Vijayanagar)"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="search"
                  />

                  <h2 style={{ marginBottom: 15 }}>
                    {locationSearch
                      ? `📍 Shops near "${locationSearch}"`
                      : "📍 Search for a location"}
                  </h2>

                  <div className="grid">
                    {filteredShops.length === 0 ? (
                      <p className="empty-text">
                        No verified shops found
                        {locationSearch ? ` for "${locationSearch}"` : ""}.
                        Try a different location, or check back once a shop
                        owner has registered and been verified nearby.
                      </p>
                    ) : (
                      filteredShops.map((shop) => (
                        <div key={shop.email} className="shop-card">
                          <h3 className="shop-name">🏪 {shop.shopName}</h3>
                          <p className="shop-detail">{shop.address}</p>
                          <p className="shop-detail">
                            👤 {shop.ownerName} &nbsp;|&nbsp; 📞 {shop.phone}
                          </p>
                          <button className="btn" onClick={() => selectShop(shop)}>
                            View Shop →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* ---------------- STEP 2: PRODUCTS ---------------- */}
              {view === "products" && selectedShop && (
                <>
                  <button className="back-btn" onClick={() => setView("location")}>
                    ← Back to Shops
                  </button>

                  <div className="shop-header-card">
                    <h2 className="shop-name">🏪 {selectedShop.shopName}</h2>
                    <p className="shop-detail">{selectedShop.address}</p>
                  </div>

                  <input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="search"
                  />

                  <div className="grid">
                    {filteredProducts.length === 0 ? (
                      <p className="empty-text">
                        This shop hasn't added any matching products yet.
                      </p>
                    ) : (
                      filteredProducts.map((p) => (
                        <div key={p._id} className="product">
                          <img
                            src={p.image || "https://via.placeholder.com/250"}
                            alt={p.name}
                            className="image"
                          />
                          <h3>{p.name}</h3>
                          <p className="price-text">₹{p.price}</p>
                          <p className="shop-detail">
                            Qty: {p.quantity}
                            {p.category ? ` • ${p.category}` : ""}
                          </p>
                          {p.description && (
                            <p className="shop-detail">{p.description}</p>
                          )}
                          <p className="shop-detail">
                            {p.delivery ? "🚚 Delivery Available" : "❌ No Delivery"}
                          </p>
                          <button className="btn" onClick={() => addToCart(p)}>
                            Add to Cart
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="card">
                    <h2>🛒 Cart ({cart.length})</h2>
                    {cart.length === 0 ? (
                      <p>No items added</p>
                    ) : (
                      <>
                        {cart.map((item, i) => (
                          <div key={i} className="cart-row">
                            <span>
                              {item.name} - ₹{item.price}
                            </span>
                            <button className="remove-btn" onClick={() => removeFromCart(i)}>
                              ✕
                            </button>
                          </div>
                        ))}
                        <p className="cart-total"><strong>Total: ₹{cartTotal}</strong></p>
                        <button className="btn" onClick={goToPayment}>
                          Proceed to Payment →
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ---------------- STEP 3: PAYMENT ---------------- */}
              {view === "payment" && (
                <>
                  <button className="back-btn" onClick={() => setView("products")}>
                    ← Back to Products
                  </button>

                  <div className="card">
                    <h2>🧾 Order Summary</h2>
                    {cart.map((item, i) => (
                      <div key={i} className="cart-row">
                        <span>{item.name}</span>
                        <span>₹{item.price}</span>
                      </div>
                    ))}
                    <p className="cart-total"><strong>Total: ₹{cartTotal}</strong></p>
                  </div>

                  <div className="card">
                    <h2>💳 Payment Method</h2>

                    <div className="toggle-row">
                      <button
                        className={paymentMethod === "cod" ? "toggle-btn-active" : "toggle-btn"}
                        onClick={() => setPaymentMethod("cod")}
                      >
                        Cash on Delivery
                      </button>
                      <button
                        className={paymentMethod === "card" ? "toggle-btn-active" : "toggle-btn"}
                        onClick={() => setPaymentMethod("card")}
                      >
                        Card
                      </button>
                      <button
                        className={paymentMethod === "upi" ? "toggle-btn-active" : "toggle-btn"}
                        onClick={() => setPaymentMethod("upi")}
                      >
                        UPI
                      </button>
                    </div>

                    {paymentMethod === "cod" && (
                      <p className="cod-note">
                        💵 Pay with cash when your order arrives (or when you pick
                        it up). No payment details needed right now.
                      </p>
                    )}

                    {paymentMethod === "card" && (
                      <>
                        <input
                          type="text"
                          name="number"
                          placeholder="Card Number (e.g. 4111 1111 1111 1111)"
                          value={cardDetails.number}
                          onChange={handleCardChange}
                          onBlur={() =>
                            setPaymentErrors((prev) => ({
                              ...prev,
                              number: getCardNumberError(cardDetails.number) || "",
                            }))
                          }
                          className={`input ${paymentErrors.number ? "input-error" : ""}`}
                          inputMode="numeric"
                        />
                        {paymentErrors.number && (
                          <div className="field-error-msg">{paymentErrors.number}</div>
                        )}

                        <input
                          type="text"
                          name="name"
                          placeholder="Name on Card"
                          value={cardDetails.name}
                          onChange={handleCardChange}
                          onBlur={() =>
                            setPaymentErrors((prev) => ({
                              ...prev,
                              name: getCardNameError(cardDetails.name) || "",
                            }))
                          }
                          className={`input ${paymentErrors.name ? "input-error" : ""}`}
                        />
                        {paymentErrors.name && (
                          <div className="field-error-msg">{paymentErrors.name}</div>
                        )}

                        <div className="toggle-row">
                          <div style={{ flex: 1 }}>
                            <input
                              type="text"
                              name="expiry"
                              placeholder="MM/YY"
                              value={cardDetails.expiry}
                              onChange={handleCardChange}
                              onBlur={() =>
                                setPaymentErrors((prev) => ({
                                  ...prev,
                                  expiry: getExpiryError(cardDetails.expiry) || "",
                                }))
                              }
                              className={`input ${paymentErrors.expiry ? "input-error" : ""}`}
                              inputMode="numeric"
                            />
                            {paymentErrors.expiry && (
                              <div className="field-error-msg">{paymentErrors.expiry}</div>
                            )}
                          </div>

                          <div style={{ flex: 1 }}>
                            <input
                              type="text"
                              name="cvv"
                              placeholder="CVV"
                              value={cardDetails.cvv}
                              onChange={handleCardChange}
                              onBlur={() =>
                                setPaymentErrors((prev) => ({
                                  ...prev,
                                  cvv: getCvvError(cardDetails.cvv) || "",
                                }))
                              }
                              className={`input ${paymentErrors.cvv ? "input-error" : ""}`}
                              inputMode="numeric"
                            />
                            {paymentErrors.cvv && (
                              <div className="field-error-msg">{paymentErrors.cvv}</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {paymentMethod === "upi" && (
                      <>
                        <div className="upi-app-row">
                          {UPI_APPS.map((app) => (
                            <button
                              key={app.id}
                              className={upiApp === app.id ? "upi-app-btn-active" : "upi-app-btn"}
                              onClick={() => setUpiApp(app.id)}
                            >
                              {app.emoji} {app.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder={`Enter your ${
                            UPI_APPS.find((a) => a.id === upiApp)?.label || "UPI"
                          } ID (e.g. name@okhdfcbank)`}
                          value={upiId}
                          onChange={handleUpiIdChange}
                          onBlur={() =>
                            setPaymentErrors((prev) => ({
                              ...prev,
                              upiId: getUpiIdError(upiId) || "",
                            }))
                          }
                          className={`input ${paymentErrors.upiId ? "input-error" : ""}`}
                        />
                        {paymentErrors.upiId && (
                          <div className="field-error-msg">{paymentErrors.upiId}</div>
                        )}
                      </>
                    )}

                    <button className="btn" onClick={placeOrder}>
                      Place Order ✅
                    </button>
                  </div>
                </>
              )}

              {/* ---------------- STEP 4: SUCCESS / RECEIPT ---------------- */}
              {view === "success" && (
                <div className="success-card">
                  <p className="success-msg">
                    ✅ Your order has been placed successfully!
                  </p>
                  <h2 style={{ marginBottom: 15 }}>Order Confirmed</h2>

                  {/* ── NEW: itemized bill receipt ── */}
                  <div className="receipt-box">
                    <div className="receipt-row">
                      <span>Order ID</span>
                      <span>{lastOrder?._id || lastOrder?.id || "—"}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Date</span>
                      <span>
                        {lastOrder?.createdAt
                          ? new Date(lastOrder.createdAt).toLocaleString()
                          : new Date().toLocaleString()}
                      </span>
                    </div>
                    <div className="receipt-row">
                      <span>Shop</span>
                      <span>{lastOrder?.shopName || selectedShop?.shopName || "—"}</span>
                    </div>
                    <div className="receipt-row">
                      <span>Payment Method</span>
                      <span>{lastOrder?.paymentLabel || "—"}</span>
                    </div>

                    <hr className="receipt-divider" />

                    {receiptItems.map((item, i) => (
                      <div key={i} className="receipt-row">
                        <span>{item.name}</span>
                        <span>₹{item.price}</span>
                      </div>
                    ))}

                    <hr className="receipt-divider" />

                    <div className="receipt-total-row">
                      <span>Total Paid</span>
                      <span>₹{orderTotal}</span>
                    </div>
                  </div>

                  <p className="shop-detail" style={{ marginTop: 15 }}>
                    {lastOrder?.deliveryAvailable
                      ? "🚚 Delivery available for this order"
                      : "🏃 Pickup only — no delivery for this order"}
                  </p>
                  <p className="shop-detail">
                    The shop has been notified of your order and will get back
                    to you shortly. A copy of this receipt has also been saved
                    to your Order History.
                  </p>

                  <button className="btn" onClick={printReceipt}>
                    🧾 Print / Download Receipt
                  </button>
                  <button className="btn" onClick={startNewOrder}>
                    Start New Order
                  </button>
                </div>
              )}
            </div>
          )}

          {active === "notifications" && (
            <div className="table-box">
              <h2>Notifications</h2>
              {notifications.length === 0 ? (
                <p style={{ marginTop: 12 }}>No notifications.</p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {notifications.map((n) => (
                    <div key={n._id} className="card" style={{ marginBottom: 10 }}>
                      <p>🔔 {n.message}</p>
                      <small className="shop-detail">
                        {new Date(n.createdAt).toLocaleString()}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {active === "profile" && (
            <div className="table-box">
              <h2>Profile</h2>
              <p style={{ marginTop: 12 }}><strong>Name:</strong> {currentUser.name}</p>
              <p><strong>Email:</strong> {currentUser.email}</p>
              <p><strong>Role:</strong> Customer</p>
            </div>
          )}

          {active === "settings" && (
            <div className="table-box">
              <h2>Settings</h2>
              <p style={{ marginTop: 12 }}>Email Notifications: ON</p>
              <p>Order Updates: ON</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UserDashboard;