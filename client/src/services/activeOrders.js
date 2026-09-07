/*
 * Customer active-order persistence.
 *
 * Orders are saved in localStorage so the customer can always
 * return to an order from "My Orders" - even after leaving the
 * tracking page, refreshing the browser, or switching restaurants.
 *
 * Only the checkout POST actually creates a database order.
 * Saving an order here never creates or duplicates an order.
 */

const ACTIVE_ORDERS_KEY = "chowly_active_orders";

const ORDERS_UPDATED_EVENT = "chowly:orders-updated";

function readList() {
  try {
    const raw = localStorage.getItem(ACTIVE_ORDERS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeList(list) {
  try {
    localStorage.setItem(
      ACTIVE_ORDERS_KEY,
      JSON.stringify(list)
    );

    window.dispatchEvent(
      new Event(ORDERS_UPDATED_EVENT)
    );
  } catch (error) {
    /*
     * Storage unavailable (private mode). The order is still
     * reachable through the tracking URL while the tab stays
     * open; the rest of the app keeps working.
     */
  }
}

export function getActiveOrders() {
  return readList();
}

/*
 * Add a just-created order to the customer's active order list.
 *
 * Returns true when the order was added, false when it was
 * already tracked (no duplicates are stored).
 */
export function addActiveOrder(order) {
  const id = Number(order?.id);

  if (!id) {
    return false;
  }

  const list = readList();

  const alreadyTracked = list.some(
    (entry) => Number(entry.id) === id
  );

  if (alreadyTracked) {
    return false;
  }

  writeList([
    ...list,
    {
      id,
      restaurant_id:
        Number(order.restaurant_id) ||
        null,
      restaurant_name:
        order.restaurant_name || "",
      status:
        order.status || "PENDING",
      payment_status:
        order.payment?.status ||
        order.payment_status ||
        "UNPAID",
      created_at:
        order.created_at ||
        new Date().toISOString(),
      saved_at:
        new Date().toISOString(),
    },
  ]);

  return true;
}

/*
 * Refresh the stored entry with the latest order data from the
 * backend. If the order is not tracked yet it is tracked now, so
 * a directly opened tracking URL is never lost.
 */
export function upsertActiveOrder(order, meta) {
  const id = Number(order?.id);

  if (!id) {
    return;
  }

  const list = readList();
  const index = list.findIndex(
    (entry) => Number(entry.id) === id
  );

  const existingStatus =
    index >= 0 ? list[index].status : "PENDING";

  const existingPayment =
    index >= 0
      ? list[index].payment_status
      : "UNPAID";

  const next = {
    ...(index >= 0 ? list[index] : {}),
    id,
    status:
      order.status || existingStatus,
    payment_status:
      order.payment?.status ||
      order.payment_status ||
      existingPayment,
  };

  if (index >= 0) {
    if (meta?.restaurant_id) {
      next.restaurant_id =
        Number(meta.restaurant_id);
    }

    if (meta?.restaurant_name) {
      next.restaurant_name =
        meta.restaurant_name;
    }

    const updated = list.slice();
    updated[index] = next;
    writeList(updated);
    return;
  }

  writeList([
    ...list,
    {
      ...next,
      restaurant_id:
        Number(order.restaurant_id) ||
        (meta?.restaurant_id
          ? Number(meta.restaurant_id)
          : null),
      restaurant_name:
        order.restaurant_name ||
        meta?.restaurant_name ||
        "",
      created_at:
        order.created_at ||
        new Date().toISOString(),
      saved_at:
        new Date().toISOString(),
    },
  ]);
}

/*
 * Remove an order from the active order list. Used when the
 * backend no longer has the order (so no broken entries remain).
 */
export function removeActiveOrder(orderId) {
  const id = Number(orderId);

  const list = readList().filter(
    (entry) => Number(entry.id) !== id
  );

  writeList(list);
}

/*
 * Subscribe to order list changes; also refreshed when another
 * tab writes to localStorage ("storage" event).
 */
export function subscribeChowlyOrders(handler) {
  window.addEventListener(
    ORDERS_UPDATED_EVENT,
    handler
  );

  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(
      ORDERS_UPDATED_EVENT,
      handler
    );

    window.removeEventListener(
      "storage",
      handler
    );
  };
}