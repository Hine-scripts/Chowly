import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useChowly } from "../context/ChowlyContext";
import RoleSwitcher from "../components/RoleSwitcher";
import "../styles/StaffDashboard.css";

const STATUS_LABELS = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const ROLE_CONFIG = {
  WAITER: {
    title: "Waiter",
    description:
      "Manage incoming orders, assign preparation staff and serve completed orders.",
  },

  CHEF: {
    title: "Chef",
    description:
      "Focus on food items assigned to you and move preparation through the kitchen.",
  },

  BARTENDER: {
    title: "Bartender",
    description:
      "Focus on drink items assigned to you and move preparation through the bar.",
  },

  ADMIN: {
    title: "Admin",
    description:
      "Manage the complete restaurant operation from one dashboard.",
  },
};

function StaffDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    theme,
    selectedRestaurant,
    setSelectedRestaurant,
    role,
  } = useChowly();

  const staffRoles = [
    "WAITER",
    "CHEF",
    "BARTENDER",
    "ADMIN",
  ];

  const activeRole = staffRoles.includes(role)
    ? role
    : "WAITER";

  const roleConfig =
    ROLE_CONFIG[activeRole] || ROLE_CONFIG.WAITER;

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [restaurantStaff, setRestaurantStaff] = useState([]);

  const [loading, setLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningStaff, setAssigningStaff] = useState({});
  const [assigningWaiter, setAssigningWaiter] = useState(false);

  const [error, setError] = useState("");

  /*
   * Keeps the polling interval up to date with the currently
   * selected order without restarting the interval on every
   * selection change.
   */
  const selectedOrderIdRef = useRef(null);

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrder?.id || null;
  }, [selectedOrder]);

  /*
   * Load restaurant
   */
  useEffect(() => {
    async function loadRestaurant() {
      try {
        const response = await api.get(
          `/restaurants/${id}`
        );

        const restaurantData =
          response.data?.restaurant ||
          response.data;

        if (restaurantData) {
          setSelectedRestaurant(restaurantData);
        }
      } catch (err) {
        console.error(
          "Staff restaurant loading error:",
          err
        );
      }
    }

    loadRestaurant();
  }, [id, setSelectedRestaurant]);

  /*
   * Load restaurant staff
   */
  async function loadRestaurantStaff() {
    try {
      const response = await api.get(
        `/orders/staff?restaurant_id=${id}`
      );

      const staffData =
        response.data?.staff ||
        response.data?.data ||
        [];

      setRestaurantStaff(
        Array.isArray(staffData)
          ? staffData
          : []
      );
    } catch (err) {
      console.error(
        "Restaurant staff loading error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to load restaurant staff."
      );
    }
  }

  /*
   * Load all restaurant orders
   */
  async function loadOrders(selectFirst = false) {
    try {
      setError("");

      const response = await api.get(
        `/orders?restaurant_id=${id}`
      );

      /*
       * The backend returns the order list as a bare
       * JSON array:
       *
       * response.data = [
       *   { id, status, total_amount, ... },
       *   ...
       * ]
       *
       * Older/middleware-style shapes
       * ({ orders: [...] }) are still accepted.
       */
      const orderData = Array.isArray(response.data)
        ? response.data
        : response.data?.orders || response.data?.data || [];

      const safeOrders = Array.isArray(orderData)
        ? orderData
        : [];

      setOrders(safeOrders);

      if (
        selectFirst &&
        safeOrders.length > 0
      ) {
        loadOrderDetails(safeOrders[0].id);
      }
    } catch (err) {
      console.error(
        "Staff orders loading error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to load restaurant orders."
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * Load one order in detail
   */
  async function loadOrderDetails(orderId) {
    try {
      setOrderLoading(true);
      setError("");

      const response = await api.get(
        `/orders/${orderId}`
      );

      const orderData =
        response.data?.order ||
        response.data;

      setSelectedOrder(orderData);
    } catch (err) {
      console.error(
        "Order details loading error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to load order details."
      );
    } finally {
      setOrderLoading(false);
    }
  }

  /*
   * Initial load + automatic refresh
   */
  useEffect(() => {
    loadOrders(true);
    loadRestaurantStaff();

    const interval = setInterval(() => {
      loadOrders(false);
      loadRestaurantStaff();

      if (selectedOrderIdRef.current) {
        loadOrderDetails(selectedOrderIdRef.current);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [id]);

  /*
   * Group orders by status
   */
  const groupedOrders = useMemo(() => {
    const groups = {
      PENDING: [],
      CONFIRMED: [],
      PREPARING: [],
      READY: [],
      SERVED: [],
      COMPLETED: [],
      CANCELLED: [],
    };

    orders.forEach((order) => {
      if (groups[order.status]) {
        groups[order.status].push(order);
      }
    });

    return groups;
  }, [orders]);

  /*
   * Identify food/drink items
   */
  function getItemCategory(item) {
    return String(
      item?.category_name ||
        item?.category ||
        item?.category?.name ||
        ""
    ).toLowerCase();
  }

  function getItemType(item) {
    return String(
      item?.item_type ||
        item?.itemType ||
        ""
    ).toUpperCase();
  }

  function isDrinkItem(item) {
    const category = getItemCategory(item);
    const itemType = getItemType(item);

    return (
      itemType === "DRINK" ||
      itemType === "DRINKS" ||
      category.includes("drink") ||
      category.includes("beverage") ||
      category.includes("bar") ||
      category.includes("alcoholic") ||
      category.includes("non-alcoholic")
    );
  }

  function isFoodItem(item) {
    return !isDrinkItem(item);
  }

  /*
   * Determine whether an order contains
   * items relevant to the current role.
   */
  function orderContainsRelevantItems(order) {
    if (
      activeRole === "ADMIN" ||
      activeRole === "WAITER"
    ) {
      return true;
    }

    const items = order?.items || [];

    if (items.length === 0) {
      return true;
    }

    if (activeRole === "CHEF") {
      return items.some(isFoodItem);
    }

    if (activeRole === "BARTENDER") {
      return items.some(isDrinkItem);
    }

    return false;
  }

  /*
   * Role-specific order visibility
   */
  const visibleOrders = useMemo(() => {
    if (
      activeRole === "ADMIN" ||
      activeRole === "WAITER"
    ) {
      return orders;
    }

    return orders.filter((order) => {
      if (
        ![
          "CONFIRMED",
          "PREPARING",
          "READY",
          "SERVED",
        ].includes(order.status)
      ) {
        return false;
      }

      return orderContainsRelevantItems(order);
    });
  }, [orders, activeRole]);

  /*
   * Staff filtered by role
   */
  const chefs = useMemo(() => {
    return restaurantStaff.filter(
      (staff) => staff.role === "CHEF"
    );
  }, [restaurantStaff]);

  const bartenders = useMemo(() => {
    return restaurantStaff.filter(
      (staff) => staff.role === "BARTENDER"
    );
  }, [restaurantStaff]);

  const waiters = useMemo(() => {
    return restaurantStaff.filter(
      (staff) => staff.role === "WAITER"
    );
  }, [restaurantStaff]);

  /*
   * Stats
   */
  const stats = useMemo(() => {
    if (
      activeRole === "CHEF" ||
      activeRole === "BARTENDER"
    ) {
      const relevantOrders =
        orders.filter(order =>
          orderContainsRelevantItems(order)
        );

      return {
        active: relevantOrders.filter(order =>
          [
            "CONFIRMED",
            "PREPARING",
          ].includes(order.status)
        ).length,

        pending: relevantOrders.filter(
          order => order.status === "CONFIRMED"
        ).length,

        preparing: relevantOrders.filter(
          order => order.status === "PREPARING"
        ).length,

        ready: relevantOrders.filter(
          order => order.status === "READY"
        ).length,

        served: relevantOrders.filter(
          order => order.status === "SERVED"
        ).length,

        completed: relevantOrders.filter(
          order => order.status === "COMPLETED"
        ).length,
      };
    }

    return {
      active: orders.filter(
        order =>
          ![
            "COMPLETED",
            "CANCELLED",
          ].includes(order.status)
      ).length,

      pending:
        groupedOrders.PENDING.length,

      preparing:
        groupedOrders.PREPARING.length,

      ready:
        groupedOrders.READY.length,

      served:
        groupedOrders.SERVED.length,

      completed:
        groupedOrders.COMPLETED.length,
    };
  }, [
    orders,
    groupedOrders,
    activeRole,
  ]);

  function formatPrice(amount) {
    return `₦${Number(
      amount || 0
    ).toLocaleString()}`;
  }

  function formatTime(dateValue) {
    if (!dateValue) {
      return "—";
    }

    return new Date(
      dateValue
    ).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /*
   * Role-specific next status
   *
   * Payment is deliberately NOT part
   * of this order-status sequence.
   *
   * CHEF and BARTENDER advance THEIR OWN
   * preparation items instead of the whole
   * order. A Chef can therefore mark food
   * PREPARING/READY without touching drinks,
   * and a Bartender can do the same for
   * drinks without touching food.
   */
  function getNextStatus(status, order) {
    if (activeRole === "WAITER") {
      if (status === "PENDING") {
        return "CONFIRMED";
      }

      if (status === "READY") {
        return "SERVED";
      }

      return null;
    }

    if (
      activeRole === "CHEF" ||
      activeRole === "BARTENDER"
    ) {
      /*
       * Compute the next action from the
       * preparation status of the items this
       * role controls.
       *
       *   some PENDING  -> PREPARING
       *   some PREPARING -> READY
       *   none (all READY) -> null
       */
      const items = order?.items || [];
      const relevantItems =
        activeRole === "CHEF"
          ? items.filter(isFoodItem)
          : items.filter(isDrinkItem);

      if (relevantItems.length === 0) {
        return null;
      }

      const pending = relevantItems.some(
        (item) =>
          String(
            item.preparation_status ||
              "PENDING"
          ).toUpperCase() === "PENDING"
      );

      const preparing = relevantItems.some(
        (item) =>
          String(
            item.preparation_status ||
              "PENDING"
          ).toUpperCase() === "PREPARING"
      );

      if (pending) {
        return "PREPARING";
      }

      if (preparing) {
        return "READY";
      }

      // Everything this role controls is already
      // READY; there is nothing left to do.
      return null;
    }

    if (activeRole === "ADMIN") {
      if (status === "PENDING") {
        return "CONFIRMED";
      }

      if (status === "CONFIRMED") {
        return "PREPARING";
      }

      if (status === "PREPARING") {
        return "READY";
      }

      if (status === "READY") {
        return "SERVED";
      }

      /*
       * Admin does NOT manually mark an order
       * COMPLETED. Payment does that.
       */
      return null;
    }

    return null;
  }

  /*
   * Update order status
   *
   * CHEF and BARTENDER send their role so the
   * backend only advances THEIR preparation items
   * (food for the Chef, drinks for the Bartender).
   * The overall order status is then derived from
   * every item, so one role can never mark the
   * whole mixed order as READY.
   */
  async function updateStatus(status) {
    if (!selectedOrder) {
      return;
    }

    try {
      setUpdatingStatus(true);
      setError("");

      const payload = { status };

      if (
        activeRole === "CHEF" ||
        activeRole === "BARTENDER"
      ) {
        payload.role = activeRole;
      }

      const response = await api.patch(
        `/orders/${selectedOrder.id}/status`,
        payload
      );

      const updatedOrder =
        response.data?.order;

      setSelectedOrder((current) => ({
        ...current,
        ...(updatedOrder || {}),
        status:
          updatedOrder?.status ||
          status,
      }));

      await loadOrders(false);
      await loadOrderDetails(
        selectedOrder.id
      );
    } catch (err) {
      console.error(
        "Order status update error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to update order status."
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  /*
   * Cancel order
   */
  async function cancelOrder() {
    if (!selectedOrder) {
      return;
    }

    await updateStatus("CANCELLED");
  }

  /*
   * Assign a waiter to the selected order.
   */
  async function assignWaiter(waiterId) {
    if (!selectedOrder || !waiterId) {
      return;
    }

    try {
      setAssigningWaiter(true);
      setError("");

      await api.patch(
        `/orders/${selectedOrder.id}/waiter`,
        {
          waiter_id: Number(waiterId),
        }
      );

      await loadOrderDetails(
        selectedOrder.id
      );

      await loadOrders(false);
    } catch (err) {
      console.error(
        "Waiter assignment error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to assign waiter."
      );
    } finally {
      setAssigningWaiter(false);
    }
  }

  /*
   * Assign preparation staff to an individual
   * order item.
   *
   * Food items -> Chef
   * Drink items -> Bartender
   */
  async function assignStaff(
    itemId,
    staffId,
    staffRole
  ) {
    if (!selectedOrder || !itemId) {
      return;
    }

    if (!staffId) {
      return;
    }

    try {
      setAssigningStaff((current) => ({
        ...current,
        [itemId]: true,
      }));

      setError("");

      const payload =
        staffRole === "CHEF"
          ? { chef_id: Number(staffId) }
          : { bartender_id: Number(staffId) };

      await api.patch(
        `/orders/${selectedOrder.id}/items/${itemId}/staff`,
        payload
      );

      await loadOrderDetails(
        selectedOrder.id
      );
    } catch (err) {
      console.error(
        "Preparation staff assignment error:",
        err
      );

      setError(
        err.response?.data?.message ||
          "Unable to assign preparation staff."
      );
    } finally {
      setAssigningStaff((current) => ({
        ...current,
        [itemId]: false,
      }));
    }
  }

  /*
   * Get items relevant to the current
   * preparation role.
   */
  function getVisibleItems(order) {
    const items = order?.items || [];

    if (
      activeRole === "ADMIN" ||
      activeRole === "WAITER"
    ) {
      return items;
    }

    if (activeRole === "CHEF") {
      return items.filter(isFoodItem);
    }

    if (activeRole === "BARTENDER") {
      return items.filter(isDrinkItem);
    }

    return items;
  }

  const visibleSelectedItems =
    getVisibleItems(selectedOrder);

  /*
   * Determine whether this role should
   * be able to interact with the order.
   */
  const selectedOrderIsRelevant =
    selectedOrder
      ? orderContainsRelevantItems(
          selectedOrder
        )
      : false;

  const nextStatus = selectedOrder
    ? getNextStatus(
        selectedOrder.status,
        selectedOrder
      )
    : null;

  /*
   * Restaurant information
   */
  const restaurantName =
    selectedRestaurant?.name ||
    selectedOrder?.restaurant_name ||
    theme?.name ||
    "Restaurant";

  /*
   * Theme variables
   */
  const themeStyles = {
    "--staff-bg":
      theme?.background ||
      "#f7efcf",

    "--staff-surface":
      theme?.surface ||
      "#ffffff",

    "--staff-primary":
      theme?.primary ||
      "#3d2929",

    "--staff-secondary":
      theme?.secondary ||
      "#d9a6a6",

    "--staff-accent":
      theme?.accent ||
      "#b96f6f",

    "--staff-text":
      theme?.text ||
      "#2f2f2f",

    "--staff-heading-font":
      theme?.fontHeading ||
      "'Playfair Display', serif",

    "--staff-body-font":
      theme?.fontBody ||
      "'DM Sans', sans-serif",
  };

  return (
    <main
      className={`staff-page ${
        theme?.style
          ? `staff-${theme.style}`
          : ""
      }`}
      style={themeStyles}
    >
      {/* HEADER */}

      <header className="staff-header">
        <div className="staff-header-left">
          <button
            className="staff-back-button"
            onClick={() =>
              navigate(
                `/restaurant/${id}`
              )
            }
          >
            ← Restaurant
          </button>

          <div className="staff-brand">
            <span className="staff-logo">
              {theme?.logo || "🍽️"}
            </span>

            <div>
              <span className="staff-eyebrow">
                STAFF DASHBOARD
              </span>

              <h1>
                {restaurantName}
              </h1>
            </div>
          </div>
        </div>

        <div className="staff-header-right">
          <div className="staff-role">
            <span>
              ACTIVE ROLE
            </span>

            <strong>
              {activeRole}
            </strong>
          </div>

          <RoleSwitcher />
        </div>
      </header>

      {/* MAIN */}

      <div className="staff-content">

        {/* WELCOME */}

        <section className="staff-welcome">
          <div>
            <span className="staff-eyebrow">
              {theme?.tagline ||
                "Restaurant operations"}
            </span>

            <h2>
              {roleConfig.title} dashboard.
            </h2>

            <p>
              {roleConfig.description}
            </p>
          </div>

          <button
            className="staff-refresh-button"
            onClick={() => {
              loadOrders(false);
              loadRestaurantStaff();

              if (selectedOrder?.id) {
                loadOrderDetails(
                  selectedOrder.id
                );
              }
            }}
          >
            ↻ Refresh
          </button>
        </section>

        {/* ERROR */}

        {error && (
          <div className="staff-error">
            {error}
          </div>
        )}

        {/* STATS */}

        <section className="staff-stats">
          <div className="staff-stat-card">
            <span>
              ACTIVE ORDERS
            </span>

            <strong>
              {stats.active}
            </strong>
          </div>

          <div className="staff-stat-card">
            <span>
              {activeRole === "CHEF" ||
              activeRole === "BARTENDER"
                ? "QUEUED"
                : "NEW ORDERS"}
            </span>

            <strong>
              {stats.pending}
            </strong>
          </div>

          <div className="staff-stat-card">
            <span>
              PREPARING
            </span>

            <strong>
              {stats.preparing}
            </strong>
          </div>

          <div className="staff-stat-card">
            <span>
              READY
            </span>

            <strong>
              {stats.ready}
            </strong>
          </div>

          <div className="staff-stat-card">
            <span>
              SERVED
            </span>

            <strong>
              {stats.served}
            </strong>
          </div>

          <div className="staff-stat-card">
            <span>
              COMPLETED
            </span>

            <strong>
              {stats.completed}
            </strong>
          </div>
        </section>

        {/* WORKSPACE */}

        <section className="staff-workspace">

          {/* ORDER QUEUE */}

          <div className="staff-orders-panel">
            <div className="staff-panel-heading">
              <div>
                <span className="staff-eyebrow">
                  {activeRole === "CHEF" ||
                  activeRole === "BARTENDER"
                    ? "PREPARATION QUEUE"
                    : "LIVE QUEUE"}
                </span>

                <h2>
                  Orders
                </h2>
              </div>

              <span className="staff-order-count">
                {visibleOrders.length}{" "}
                showing
              </span>
            </div>

            {loading ? (
              <div className="staff-empty">
                Loading orders...
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="staff-empty">
                <div className="staff-empty-icon">
                  ✓
                </div>

                <strong>
                  No orders here
                </strong>

                <span>
                  {activeRole === "CHEF" ||
                  activeRole === "BARTENDER"
                    ? "Orders requiring your preparation will appear here."
                    : "New customer orders will appear here."}
                </span>
              </div>
            ) : (
              <div className="staff-order-list">
                {visibleOrders.map(
                  (order) => (
                    <button
                      key={order.id}
                      className={`staff-order-row ${
                        selectedOrder?.id ===
                        order.id
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        loadOrderDetails(
                          order.id
                        )
                      }
                    >
                      <div className="staff-order-main">
                        <strong>
                          #{order.id}
                        </strong>

                        <span>
                          {order.item_count ||
                            0}{" "}
                          {Number(
                            order.item_count
                          ) === 1
                            ? "item"
                            : "items"}
                        </span>

                        <span>
                          {formatTime(
                            order.created_at
                          )}
                        </span>
                      </div>

                      <div className="staff-order-meta">
                        <strong>
                          {formatPrice(
                            order.total_amount
                          )}
                        </strong>

                        <span
                          className={`staff-status staff-status-${String(
                            order.status
                          ).toLowerCase()}`}
                        >
                          {STATUS_LABELS[
                            order.status
                          ] ||
                            order.status}
                        </span>
                      </div>
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* ORDER DETAILS */}

          <aside className="staff-details-panel">

            {!selectedOrder ? (
              <div className="staff-select-order">
                <div className="staff-select-icon">
                  👆
                </div>

                <strong>
                  Select an order
                </strong>

                <span>
                  Choose an order from
                  the queue to view its
                  details.
                </span>
              </div>
            ) : orderLoading ? (
              <div className="staff-select-order">
                Loading order...
              </div>
            ) : (
              <>
                <div className="staff-details-heading">
                  <div>
                    <span className="staff-eyebrow">
                      ORDER
                    </span>

                    <h2>
                      #{selectedOrder.id}
                    </h2>
                  </div>

                  <span
                    className={`staff-status staff-status-${String(
                      selectedOrder.status
                    ).toLowerCase()}`}
                  >
                    {STATUS_LABELS[
                      selectedOrder.status
                    ] ||
                      selectedOrder.status}
                  </span>
                </div>

                {/* CUSTOMER DETAILS */}

                <div className="staff-order-info">
                  <div>
                    <span>
                      CUSTOMER
                    </span>

                    <strong>
                      {selectedOrder.customer_name ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      PHONE
                    </span>

                    <strong>
                      {selectedOrder.customer_phone ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      TABLE
                    </span>

                    <strong>
                      {selectedOrder.table_number ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      PLACED
                    </span>

                    <strong>
                      {formatTime(
                        selectedOrder.created_at
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      EST. WAIT
                    </span>

                    <strong>
                      {selectedOrder
                        .estimated_wait_minutes
                        ? `${selectedOrder.estimated_wait_minutes} min`
                        : "Calculating"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      PAYMENT
                    </span>

                    <strong>
                      {selectedOrder
                        .payment?.status ||
                        selectedOrder
                          .payment_status ||
                        "UNPAID"}
                    </strong>
                  </div>
                </div>

                {/* SPECIAL REQUEST */}

                {selectedOrder.special_request && (
                  <div className="staff-payment-box">
                    <div>
                      <span>
                        Special request / note
                      </span>

                      <strong>
                        {
                          selectedOrder.special_request
                        }
                      </strong>
                    </div>
                  </div>
                )}

                {/* WAITER ASSIGNMENT */}

                <div className="staff-payment-box staff-waiter-box">
                  <div>
                    <span>
                      WAITER
                    </span>

                    <strong>
                      {selectedOrder.waiter_name ||
                        "Not assigned"}
                    </strong>
                  </div>

                  {(activeRole === "WAITER" ||
                    activeRole === "ADMIN") && (
                    <select
                      className="staff-waiter-select"
                      value={
                        selectedOrder.waiter_id || ""
                      }
                      onChange={(event) =>
                        assignWaiter(
                          event.target.value
                        )
                      }
                      disabled={assigningWaiter}
                    >
                      <option value="">
                        {assigningWaiter
                          ? "Assigning..."
                          : "Select waiter"}
                      </option>

                      {waiters.map((staff) => (
                        <option
                          key={staff.id}
                          value={staff.id}
                        >
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* ITEMS */}

                <div className="staff-items-section">
                  <div className="staff-section-title">
                    {activeRole === "CHEF"
                      ? "FOOD ITEMS"
                      : activeRole ===
                        "BARTENDER"
                      ? "DRINK ITEMS"
                      : "ORDER ITEMS"}
                  </div>

                  <div className="staff-items">
                    {visibleSelectedItems.length ===
                    0 ? (
                      <div className="staff-empty">
                        No items assigned to
                        this role.
                      </div>
                    ) : (
                      visibleSelectedItems.map(
                        (item) => {
                          const drink =
                            isDrinkItem(item);

                          const assignedStaffId =
                            drink
                              ? item.bartender_id
                              : item.chef_id;

                          const assignedStaffName =
                            drink
                              ? item.bartender_name
                              : item.chef_name;

                          const staffList =
                            drink
                              ? bartenders
                              : chefs;

                          const staffRole =
                            drink
                              ? "BARTENDER"
                              : "CHEF";

                          return (
                            <div
                              key={item.id}
                              className="staff-item"
                            >
                              <div className="staff-item-top">
                                <div>
                                  <strong>
                                    {
                                      item.quantity
                                    }×{" "}
                                    {
                                      item.menu_item_name
                                    }
                                  </strong>

                                  <span>
                                    {formatPrice(
                                      Number(
                                        item.unit_price
                                      ) *
                                        Number(
                                          item.quantity
                                        )
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* OPTIONS */}

                              {item.options
                                ?.length >
                                0 && (
                                <div className="staff-options">
                                  {item.options.map(
                                    (
                                      option
                                    ) => (
                                      <span
                                        key={
                                          option.id
                                        }
                                      >
                                        +{" "}
                                        {
                                          option.name
                                        }
                                      </span>
                                    )
                                  )}
                                </div>
                              )}

                              {/* PREPARATION ASSIGNMENT */}

                              {activeRole ===
                                "WAITER" && (
                                <div className="staff-assignment">
                                  <span>
                                    {drink
                                      ? "Bartender"
                                      : "Chef"}
                                  </span>

                                  <select
                                    value={
                                      assignedStaffId ||
                                      ""
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      assignStaff(
                                        item.id,
                                        event
                                          .target
                                          .value,
                                        staffRole
                                      )
                                    }
                                    disabled={
                                      assigningStaff[
                                        item.id
                                      ]
                                    }
                                  >
                                    <option value="">
                                      {assigningStaff[
                                        item.id
                                      ]
                                        ? "Assigning..."
                                        : `Select ${
                                            drink
                                              ? "bartender"
                                              : "chef"
                                          }`}
                                    </option>

                                    {staffList.map(
                                      (
                                        staff
                                      ) => (
                                        <option
                                          key={
                                            staff.id
                                          }
                                          value={
                                            staff.id
                                          }
                                        >
                                          {
                                            staff.name
                                          }
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              )}

                              {/* CURRENT ASSIGNMENT FOR
                                  NON-WAITER ROLES */}

                              {activeRole !==
                                "WAITER" &&
                                assignedStaffName && (
                                  <div className="staff-assignment">
                                    <span>
                                      {drink
                                        ? "Bartender"
                                        : "Chef"}
                                    </span>

                                    <strong>
                                      {
                                        assignedStaffName
                                      }
                                    </strong>
                                  </div>
                                )}

                              {/* ITEM TYPE */}

                              <div className="staff-assignment">
                                <span>
                                  {drink
                                    ? "Drink"
                                    : "Food"}
                                </span>
                              </div>

                              {/* PREPARATION STATUS */}

                              <div className="staff-assignment">
                                <span>
                                  Preparation
                                </span>

                                <strong
                                  className={`staff-status staff-status-${String(
                                    item.preparation_status ||
                                      "PENDING"
                                  ).toLowerCase()}`}
                                >
                                  {STATUS_LABELS[
                                    item.preparation_status
                                  ] ||
                                    item.preparation_status ||
                                    "Pending"}
                                </strong>
                              </div>
                            </div>
                          );
                        }
                      )
                    )}
                  </div>
                </div>

                {/* TOTAL */}

                <div className="staff-total">
                  <span>
                    TOTAL
                  </span>

                  <strong>
                    {formatPrice(
                      selectedOrder.total_amount
                    )}
                  </strong>
                </div>

                {/* COMPLAINT */}

                {selectedOrder.complaints &&
                  selectedOrder.complaints.length >
                    0 && (
                    <div className="staff-payment-box">
                      <div>
                        <span>
                          Customer complaint
                        </span>

                        {selectedOrder.complaints.map(
                          (complaint) => (
                            <strong
                              key={
                                complaint.id
                              }
                            >
                              {
                                complaint.description
                              }
                            </strong>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* PAYMENT */}

                {selectedOrder.payment && (
                  <div className="staff-payment-box">
                    <div>
                      <span>
                        Payment method
                      </span>

                      <strong>
                        {
                          selectedOrder
                            .payment
                            .payment_method
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Transaction
                      </span>

                      <strong>
                        {
                          selectedOrder
                            .payment
                            .transaction_reference
                        }
                      </strong>
                    </div>
                  </div>
                )}

                {/* ACTIONS */}

                <div className="staff-actions">

                  {!selectedOrderIsRelevant &&
                    activeRole !== "ADMIN" &&
                    activeRole !== "WAITER" && (
                      <div className="staff-complete-message">
                        This order does not
                        contain items for
                        your role.
                      </div>
                    )}

                  {nextStatus &&
                    selectedOrderIsRelevant && (
                      <button
                        className="staff-primary-action"
                        onClick={() =>
                          updateStatus(
                            nextStatus
                          )
                        }
                        disabled={
                          updatingStatus
                        }
                      >
                        {updatingStatus
                          ? "UPDATING..."
                          : `MARK AS ${STATUS_LABELS[
                              nextStatus
                            ].toUpperCase()}`}
                      </button>
                    )}

                  {/* ADMIN CANCEL */}

                  {activeRole ===
                    "ADMIN" &&
                    ![
                      "COMPLETED",
                      "CANCELLED",
                    ].includes(
                      selectedOrder.status
                    ) && (
                      <button
                        className="staff-cancel-action"
                        onClick={
                          cancelOrder
                        }
                        disabled={
                          updatingStatus
                        }
                      >
                        Cancel order
                      </button>
                    )}

                  {/* WAITER CANCEL */}

                  {activeRole ===
                    "WAITER" &&
                    selectedOrder.status ===
                      "PENDING" && (
                      <button
                        className="staff-cancel-action"
                        onClick={
                          cancelOrder
                        }
                        disabled={
                          updatingStatus
                        }
                      >
                        Cancel order
                      </button>
                    )}

                  {/* COMPLETED */}

                  {selectedOrder.status ===
                    "COMPLETED" && (
                    <div className="staff-complete-message">
                      This order has been
                      completed after
                      payment.
                    </div>
                  )}

                  {/* CANCELLED */}

                  {selectedOrder.status ===
                    "CANCELLED" && (
                    <div className="staff-complete-message">
                      This order has been
                      cancelled.
                    </div>
                  )}

                  {/* SERVED */}

                  {selectedOrder.status ===
                    "SERVED" && (
                    <div className="staff-complete-message">
                      Order served. Payment
                      can now be recorded.
                    </div>
                  )}

                  {/* NO ACTION */}

                  {!nextStatus &&
                    ![
                      "COMPLETED",
                      "CANCELLED",
                      "SERVED",
                    ].includes(
                      selectedOrder.status
                    ) &&
                    selectedOrderIsRelevant &&
                    (
                      activeRole ===
                        "CHEF" ||
                      activeRole ===
                        "BARTENDER"
                    ) && (
                      <div className="staff-complete-message">
                        No action available
                        for this role at
                        this stage.
                      </div>
                    )}
                </div>
              </>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}

export default StaffDashboard;