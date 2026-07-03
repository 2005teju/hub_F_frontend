import React, { useState, useEffect } from "react";
import api from "../../api";

const CATEGORY_OPTIONS = [
  "Vegetables",
  "Fruits",
  "Dairy",
  "Grains & Pulses",
  "Bakery",
  "Snacks",
  "Beverages",
  "Personal Care",
  "Household",
  "Stationery",
  "Clothing",
  "Footwear",
  "Electronics",
  "Hand Products",
  "Other",

];

// ── NEW: shop details validators ──

// Exactly 10 digits, numbers only (Indian mobile format)
function getPhoneError(phone) {
  const trimmed = (phone || "").trim();
  if (!trimmed) return "Phone number is required.";
  if (!/^\d+$/.test(trimmed)) return "Phone number must contain digits only (0-9).";
  if (trimmed.length !== 10) return "Phone number must be exactly 10 digits.";
  return null;
}

// Indian GST format: 2-digit state code + 10-char PAN + 1 entity code + Z + 1 checksum
// e.g. 29AAAAA0000A1Z5
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function getGstError(gstId) {
  const trimmed = (gstId || "").trim().toUpperCase();
  if (!trimmed) return "GST ID is required.";
  if (trimmed.length !== 15) return "GST ID must be exactly 15 characters.";
  if (!GST_REGEX.test(trimmed)) {
    return "Invalid GST ID format (e.g. 29AAAAA0000A1Z5).";
  }
  return null;
}

// Customer/trade license: alphanumeric, 5-20 characters, no special symbols
const LICENSE_REGEX = /^[A-Za-z0-9]{5,20}$/;

function getLicenseError(license) {
  const trimmed = (license || "").trim();
  if (!trimmed) return "Customer license number is required.";
  if (!LICENSE_REGEX.test(trimmed)) {
    return "License number must be 5-20 letters/numbers only, no special characters.";
  }
  return null;
}

// Letters and spaces only for owner name
function getOwnerNameError(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "Owner name is required.";
  if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmed)) {
    return "Name can only contain letters, spaces, and ' . -";
  }
  return null;
}

const OwnerDashboard = ({ onLogout }) => {
  const currentUser =
    JSON.parse(localStorage.getItem("currentUser")) || {};

  const [approved, setApproved] = useState(false);
  const [active, setActive] = useState("dashboard");

  const [owner, setOwner] = useState({
    name: currentUser.name || "",
    phone: "",
    shopName: "",
    address: "",
    gstId: "",
    customerLicense: "",
    verified: false,
  });

  const [products, setProducts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);

  // ── NEW: live validation error messages for the shop details form ──
  const [ownerErrors, setOwnerErrors] = useState({
    name: "",
    phone: "",
    shopName: "",
    address: "",
    gstId: "",
    customerLicense: "",
  });

  const [form, setForm] = useState({
    name: "",
    price: "",
    quantity: "",
    category: "",
    image: "",
    description: "",
    delivery: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const me = await api.getMe();
      setApproved(me.user.approved || false);

      const shopRes = await api.getMyShop();
      if (shopRes.shop) {
        setOwner({
          name: shopRes.shop.name || currentUser.name || "",
          phone: shopRes.shop.phone || "",
          shopName: shopRes.shop.shopName || "",
          address: shopRes.shop.address || "",
          gstId: shopRes.shop.gstId || "",
          customerLicense: shopRes.shop.customerLicense || "",
          verified: shopRes.shop.verified || false,
        });
      }

      if (shopRes.shop && shopRes.shop.verified) {
        const myProducts = await api.getMyProducts();
        setProducts(myProducts);
      } else {
        setProducts([]);
      }

      // ✅ Now from MongoDB, not localStorage
      const myNotifications = await api.getNotifications();
      setNotifications(myNotifications);

      const myShopOrders = await api.getShopOrders();
      setShopOrders(myShopOrders);

    } catch (err) {
      console.error("Failed to load owner data:", err.message);
    }
  };

  // ✅ Now updates MongoDB, not localStorage
  const markNotificationRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read:", err.message);
    }
  };

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const handleOwnerChange = (e) => {
    const { name, value } = e.target;
    let nextValue = value;

    // ── NEW: light formatting as the user types ──
    if (name === "phone") {
      nextValue = value.replace(/\D/g, "").slice(0, 10);
    } else if (name === "gstId") {
      nextValue = value.toUpperCase().slice(0, 15);
    }

    setOwner((prev) => ({ ...prev, [name]: nextValue }));

    // ── NEW: live validation per field ──
    const validators = {
      name: getOwnerNameError,
      phone: getPhoneError,
      gstId: getGstError,
      customerLicense: getLicenseError,
    };
    if (validators[name]) {
      setOwnerErrors((prev) => ({ ...prev, [name]: validators[name](nextValue) || "" }));
    }
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveShopDetails = async () => {
    const shopData = {
      name: owner.name.trim(),
      phone: owner.phone.trim(),
      shopName: owner.shopName.trim(),
      address: owner.address.trim(),
      gstId: owner.gstId.trim().toUpperCase(),
      customerLicense: owner.customerLicense.trim(),
    };

    if (
      !shopData.name ||
      !shopData.phone ||
      !shopData.shopName ||
      !shopData.address ||
      !shopData.gstId ||
      !shopData.customerLicense
    ) {
      alert("Please fill all required fields.");
      return;
    }

    // ── NEW: run full format validation before submitting ──
    const nameError = getOwnerNameError(shopData.name);
    const phoneError = getPhoneError(shopData.phone);
    const gstError = getGstError(shopData.gstId);
    const licenseError = getLicenseError(shopData.customerLicense);

    setOwnerErrors((prev) => ({
      ...prev,
      name: nameError || "",
      phone: phoneError || "",
      gstId: gstError || "",
      customerLicense: licenseError || "",
    }));

    if (nameError || phoneError || gstError || licenseError) {
      alert("Please fix the highlighted fields before submitting.");
      return;
    }

    try {
      const res = await api.saveShop(shopData);
      setOwner({ ...shopData, verified: res.shop.verified });
      alert(res.message || "Shop details saved successfully waiting for admin verification.");
    } catch (err) {
      // ── NEW: surface duplicate GST ID errors from the backend inline,
      // under the GST field, instead of a generic alert ──
      const message = err.message || "";
      if (message.toLowerCase().includes("gst")) {
        setOwnerErrors((prev) => ({ ...prev, gstId: message }));
      } else {
        alert(message || "Failed to save shop details.");
      }
    }
  };

  const addProduct = async () => {
    if (!form.name || !form.price || !form.quantity || !form.category) {
      alert("Please enter product name, price, quantity and category.");
      return;
    }

    try {
      const res = await api.addProduct(form);
      setProducts((prev) => [...prev, res.product]);

      setForm({
        name: "",
        price: "",
        quantity: "",
        category: "",
        image: "",
        description: "",
        delivery: false,
      });

      alert(res.message || "Product Added Successfully.");
    } catch (err) {
      alert(err.message || "Failed to add product.");
    }
  };

  const deleteProduct = async (id) => {
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      alert(err.message || "Failed to delete product.");
    }
  };

  // ── NEW: accept an order ──
  const handleAcceptOrder = async (id) => {
    try {
      await api.updateOrderStatus(id, "Accepted");
      loadData();
      alert("Order accepted successfully");
    } catch (err) {
      alert(err.message || "Failed to accept order.");
    }
  };

  // ── NEW: reject an order ──
  const handleRejectOrder = async (id) => {
    try {
      await api.updateOrderStatus(id, "Rejected");
      loadData();
      alert("Order rejected successfully");
    } catch (err) {
      alert(err.message || "Failed to reject order.");
    }
  };

  const navItems = [
    { icon: "📊", label: "Dashboard", key: "dashboard" },
    { icon: "🏪", label: "Shop Details", key: "shopDetails" },
    { icon: "🛒", label: "My Products", key: "myProducts" },
    { icon: "➕", label: "Add Product", key: "addProduct" },
    { icon: "📦", label: "Orders Received", key: "orders" },
    { icon: "🧾", label: "Order History", key: "orderHistory" },
    { icon: "👤", label: "Profile", key: "profile" },
    { icon: "⚙️", label: "Settings", key: "settings" },
  ];

  const currentTab = navItems.find((n) => n.key === active) || navItems[0];

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
          background:linear-gradient(135deg,#6366f1,#10b981);
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
          background:linear-gradient(135deg,#6366f1,#10b981);
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
        .input{
          width:100%;
          padding:12px;
          margin-bottom:15px;
          border-radius:8px;
          border:1px solid #ddd;
          font-size:16px;
        }
        .textarea{
          width:100%;
          padding:12px;
          margin-bottom:15px;
          border-radius:8px;
          border:1px solid #ddd;
          min-height:100px;
          font-size:16px;
        }
        .checkbox{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:20px;
          font-size:16px;
        }
        .btn{
          width:100%;
          background:#2563eb;
          color:#fff;
          border:none;
          padding:14px;
          border-radius:8px;
          cursor:pointer;
          font-weight:bold;
          font-size:16px;
        }
        .verified-summary{
          background:#f0fdf4;
          border:1px solid #bbf7d0;
          border-radius:10px;
          padding:18px 20px;
          margin-bottom:10px;
          line-height:1.7;
        }
        .pending-box{
          background:#fff5f5;
          border:1px solid #fecaca;
          padding:30px;
          border-radius:15px;
          text-align:center;
        }
        .grid{
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
          gap:20px;
          margin-top:20px;
        }
        .product-card{
          background:#fff;
          border:1px solid #eee;
          border-radius:15px;
          padding:20px;
          text-align:center;
          box-shadow:0 6px 15px rgba(0,0,0,.08);
        }
        .product-card img{
          width:100%;
          height:180px;
          object-fit:cover;
          border-radius:10px;
          margin-bottom:15px;
        }
        .delete-btn{
          background:#ef4444;
          color:#fff;
          border:none;
          padding:10px 15px;
          border-radius:8px;
          margin-top:15px;
          cursor:pointer;
          font-weight:bold;
        }
        .notification-row{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          padding:12px 0;
          border-bottom:1px solid #eee;
        }
        .notification-row.unread{
          background:#eff6ff;
          border-radius:8px;
          padding:12px;
        }
        .mark-read-btn{
          background:#2563eb;
          color:#fff;
          border:none;
          padding:8px 12px;
          border-radius:6px;
          cursor:pointer;
          font-weight:bold;
          font-size:13px;
          white-space:nowrap;
        }
        .input.input-error{
          border-color:#ef4444;
          background:#fef2f2;
        }
        .field-error-msg{
          margin:-10px 0 12px 0;
          font-size:12.5px;
          color:#ef4444;
          font-weight:600;
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
                <p>Shop Owner</p>
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

          {!approved ? (
            <div className="pending-box">
              <h2>⏳ Waiting for Admin Approval</h2>
              <p>
                Your account has been created. Please wait until the admin
                approves your request.
              </p>
            </div>
          ) : (
            <>
              {active === "dashboard" && (
                <div className="table-box">
                  <h2>Overview</h2>
                  <p style={{ marginTop: 12 }}>
                    Shop: {owner.shopName || "Not set up yet"}
                  </p>
                  <p>Status: {owner.verified ? "✅ Verified" : "⏳ Pending Verification"}</p>
                  <p>Total Products: {products.length}</p>
                  <p>Orders Received: {shopOrders.length}</p>
                  <p>Unread Notifications: {unreadNotificationCount}</p>
                </div>
              )}

              {active === "shopDetails" && (
                <div className="table-box">
                  {!owner.verified ? (
                    <>
                      <input
                        type="text"
                        name="name"
                        placeholder="Owner Name"
                        value={owner.name || ""}
                        onChange={handleOwnerChange}
                        onBlur={() =>
                          setOwnerErrors((prev) => ({
                            ...prev,
                            name: getOwnerNameError(owner.name) || "",
                          }))
                        }
                        className={`input ${ownerErrors.name ? "input-error" : ""}`}
                      />
                      {ownerErrors.name && (
                        <div className="field-error-msg">{ownerErrors.name}</div>
                      )}

                      <input
                        type="tel"
                        name="phone"
                        placeholder="Phone Number (10 digits)"
                        value={owner.phone || ""}
                        onChange={handleOwnerChange}
                        onBlur={() =>
                          setOwnerErrors((prev) => ({
                            ...prev,
                            phone: getPhoneError(owner.phone) || "",
                          }))
                        }
                        className={`input ${ownerErrors.phone ? "input-error" : ""}`}
                        inputMode="numeric"
                      />
                      {ownerErrors.phone && (
                        <div className="field-error-msg">{ownerErrors.phone}</div>
                      )}

                      <input
                        type="text"
                        name="shopName"
                        placeholder="Shop Name"
                        value={owner.shopName || ""}
                        onChange={handleOwnerChange}
                        className="input"
                      />
                      <input
                        type="text"
                        name="address"
                        placeholder="Shop Address"
                        value={owner.address || ""}
                        onChange={handleOwnerChange}
                        className="input"
                      />

                      <input
                        type="text"
                        name="gstId"
                        placeholder="GST ID (e.g. 29AAAAA0000A1Z5)"
                        value={owner.gstId || ""}
                        onChange={handleOwnerChange}
                        onBlur={() =>
                          setOwnerErrors((prev) => ({
                            ...prev,
                            gstId: getGstError(owner.gstId) || "",
                          }))
                        }
                        className={`input ${ownerErrors.gstId ? "input-error" : ""}`}
                      />
                      {ownerErrors.gstId && (
                        <div className="field-error-msg">{ownerErrors.gstId}</div>
                      )}

                      <input
                        type="text"
                        name="customerLicense"
                        placeholder="Customer License Number"
                        value={owner.customerLicense || ""}
                        onChange={handleOwnerChange}
                        onBlur={() =>
                          setOwnerErrors((prev) => ({
                            ...prev,
                            customerLicense: getLicenseError(owner.customerLicense) || "",
                          }))
                        }
                        className={`input ${ownerErrors.customerLicense ? "input-error" : ""}`}
                      />
                      {ownerErrors.customerLicense && (
                        <div className="field-error-msg">{ownerErrors.customerLicense}</div>
                      )}

                      <button className="btn" onClick={saveShopDetails}>
                        Submit for Verification
                      </button>
                      {owner.shopName && (
                        <p
                          style={{
                            color: "#dc2626",
                            textAlign: "center",
                            marginTop: 15,
                            fontWeight: "bold",
                          }}
                        >
                          ⏳ Waiting for Admin Verification. Products can be
                          added only after approval.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="verified-summary">
                      <p><strong>Owner Name:</strong> {owner.name}</p>
                      <p><strong>Phone:</strong> {owner.phone}</p>
                      <p><strong>Shop Name:</strong> {owner.shopName}</p>
                      <p><strong>Address:</strong> {owner.address}</p>
                      <p><strong>GST ID:</strong> {owner.gstId}</p>
                      <p><strong>Customer License:</strong> {owner.customerLicense}</p>
                      <p style={{ color: "#16a34a", fontWeight: "bold", marginTop: 10 }}>
                        ✅ Your shop has been verified by the admin.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {active === "myProducts" && (
                <div className="table-box">
                  <h2>My Products</h2>
                  {!owner.verified ? (
                    <p>Your shop must be verified before products can be shown here.</p>
                  ) : (
                    <div className="grid">
                      {products.length === 0 ? (
                        <p>No products added yet.</p>
                      ) : (
                        products.map((p) => (
                          <div key={p._id} className="product-card">
                            <img
                              src={p.image || "https://via.placeholder.com/250"}
                              alt={p.name}
                            />
                            <h3>{p.name}</h3>
                            <p><strong>₹{p.price}</strong></p>
                            <p><strong>Quantity:</strong> {p.quantity}</p>
                            <p><strong>Category:</strong> {p.category}</p>
                            <p>{p.description}</p>
                            <p>
                              {p.delivery
                                ? "🚚 Delivery Available"
                                : "❌ No Delivery"}
                            </p>
                            <p><strong>Quality:</strong> {p.quality}</p>
                            <button
                              className="delete-btn"
                              onClick={() => deleteProduct(p._id)}
                            >
                              Delete Product
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {active === "addProduct" && (
                <div className="table-box">
                  <h2>Add Product</h2>
                  {!owner.verified ? (
                    <p>Your shop must be verified before you can add products.</p>
                  ) : (
                    <>
                      <input
                        type="text"
                        name="name"
                        placeholder="Product Name"
                        value={form.name}
                        onChange={handleChange}
                        className="input"
                      />
                      <input
                        type="number"
                        name="price"
                        placeholder="Price"
                        value={form.price}
                        onChange={handleChange}
                        className="input"
                      />
                      <input
                        type="text"
                        name="quantity"
                        placeholder="Quantity (e.g. 1 Kg, 2 Liters)"
                        value={form.quantity}
                        onChange={handleChange}
                        className="input"
                      />
                      <select
                        name="category"
                        value={form.category}
                        onChange={handleChange}
                        className="input"
                      >
                        <option value="">Select Category</option>
                        {CATEGORY_OPTIONS.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="image"
                        placeholder="Image URL"
                        value={form.image}
                        onChange={handleChange}
                        className="input"
                      />
                      <textarea
                        name="description"
                        placeholder="Product Description"
                        value={form.description}
                        onChange={handleChange}
                        className="textarea"
                      />
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          name="delivery"
                          checked={form.delivery}
                          onChange={handleChange}
                        />
                        Delivery Available
                      </label>
                      <button className="btn" onClick={addProduct}>
                        Add Product
                      </button>
                    </>
                  )}
                </div>
              )}

              {active === "orders" && (
                <div className="table-box">
                  <h2>
                    📦 Order Notifications
                    {unreadNotificationCount > 0
                      ? ` (${unreadNotificationCount} new)`
                      : ""}
                  </h2>

                  {notifications.length === 0 ? (
                    <p>No notifications yet.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n._id}
                        className={`notification-row ${n.read ? "" : "unread"}`}
                      >
                        <div>
                          <p style={{ margin: 0 }}>{n.message}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {!n.read && (
                          <button
                            className="mark-read-btn"
                            onClick={() => markNotificationRead(n._id)}
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    ))
                  )}

                  <h2 style={{ marginTop: 30 }}>🧾 Orders Received</h2>
                  <div className="grid">
                    {shopOrders.length === 0 ? (
                      <p>No orders yet.</p>
                    ) : (
                      shopOrders.map((order) => (
                        <div key={order._id} className="product-card">
                          <h3>{order.userName}</h3>
                          <p><strong>Total: ₹{order.total}</strong></p>
                          <p><strong>Payment:</strong> {order.paymentMethod}</p>
                          <p><strong>Status:</strong> {order.status}</p>
                          <div style={{ textAlign: "left", marginTop: 10 }}>
                            {order.items.map((item, i) => (
                              <p key={i} style={{ fontSize: 14, margin: "2px 0" }}>
                                • {item.name} — ₹{item.price}
                              </p>
                            ))}
                          </div>

                          {/* ── NEW: Accept / Reject controls ── */}
                          {order.status === "Accepted" ||
                          order.status === "Rejected" ||
                          order.status === "Delivered" ? null : (
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                marginTop: 15,
                              }}
                            >
                              <button
                                className="btn"
                                style={{ margin: 0, background: "#16a34a" }}
                                onClick={() => handleAcceptOrder(order._id)}
                              >
                                Accept
                              </button>
                              <button
                                className="delete-btn"
                                style={{ width: "100%", margin: 0 }}
                                onClick={() => handleRejectOrder(order._id)}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {active === "orderHistory" && (
                <div className="table-box">
                  <h2>Order History</h2>
                  {shopOrders.length === 0 ? (
                    <p>No past orders yet.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: 12 }}>Buyer</th>
                          <th style={{ textAlign: "left", padding: 12 }}>Total</th>
                          <th style={{ textAlign: "left", padding: 12 }}>Payment</th>
                          <th style={{ textAlign: "left", padding: 12 }}>Status</th>
                          <th style={{ textAlign: "left", padding: 12 }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopOrders.map((order) => (
                          <tr key={order._id}>
                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{order.userName}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>₹{order.total}</td>
                            <td style={{ padding: 12, borderBottom: "1px solid #eee" }}>{order.paymentMethod}</td>
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

              {active === "profile" && (
                <div className="table-box">
                  <h2>Profile</h2>
                  <p style={{ marginTop: 12 }}><strong>Name:</strong> {currentUser.name}</p>
                  <p><strong>Email:</strong> {currentUser.email}</p>
                  <p><strong>Role:</strong> Shop Owner</p>
                </div>
              )}

              {active === "settings" && (
                <div className="table-box">
                  <h2>Settings</h2>
                  <p style={{ marginTop: 12 }}>Email Notifications: ON</p>
                  <p>Order Alerts: ON</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default OwnerDashboard;