import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useChowly } from "../context/ChowlyContext";
import { addActiveOrder } from "../services/activeOrders";

function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    theme,
    setSelectedRestaurant,
  } = useChowly();

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState([]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [specialRequest, setSpecialRequest] = useState("");

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  /*
   * =========================================================
   * LOAD CHECKOUT DATA
   * =========================================================
   */

  useEffect(() => {
    async function loadCheckout() {
      try {
        setLoading(true);
        setError("");

        /*
         * Load restaurant.
         */
        const restaurantResponse =
          await api.get(`/restaurants/${id}`);

        const restaurantData =
          restaurantResponse.data?.restaurant ||
          restaurantResponse.data?.data ||
          restaurantResponse.data;

        setRestaurant(restaurantData);

        if (restaurantData) {
          setSelectedRestaurant(restaurantData);
        }

        /*
         * Load menu so older carts can recover
         * preparation times.
         */
        const menuResponse = await api.get(
          `/menu?restaurant_id=${id}`
        );

        const menuData =
          menuResponse.data?.menuItems ||
          menuResponse.data?.menu ||
          menuResponse.data?.data ||
          [];

        const normalizedMenu =
          Array.isArray(menuData)
            ? menuData
            : [];

        /*
         * Load saved cart.
         */
        const savedCart =
          localStorage.getItem(
            `chowly_cart_${id}`
          );

        if (!savedCart) {
          setCart([]);
          return;
        }

        const parsedCart =
          JSON.parse(savedCart);

        if (!Array.isArray(parsedCart)) {
          setCart([]);
          return;
        }

        /*
         * Restore preparation times from
         * the current menu.
         */
        const enrichedCart =
          parsedCart.map(
            (cartItem) => {
              const menuItem =
                normalizedMenu.find(
                  (item) =>
                    Number(item.id) ===
                    Number(
                      cartItem.menu_item_id
                    )
                );

              const menuOptions =
                menuItem?.options || [];

              const enrichedOptions =
                (
                  cartItem.options ||
                  []
                ).map(
                  (selectedOption) => {
                    const menuOption =
                      menuOptions.find(
                        (option) =>
                          Number(
                            option.id
                          ) ===
                          Number(
                            selectedOption.id
                          )
                      );

                    return {
                      ...selectedOption,

                      preparation_time:
                        Number(
                          menuOption?.preparation_time ??
                            selectedOption.preparation_time ??
                            selectedOption.preparationTime ??
                            0
                        ),
                    };
                  }
                );

              return {
                ...cartItem,

                preparation_time:
                  Number(
                    menuItem?.preparation_time ??
                      cartItem.preparation_time ??
                      cartItem.preparationTime ??
                      0
                  ),

                options:
                  enrichedOptions,
              };
            }
          );

        setCart(enrichedCart);

        /*
         * Save the enriched cart.
         */
        localStorage.setItem(
          `chowly_cart_${id}`,
          JSON.stringify(
            enrichedCart
          )
        );
      } catch (err) {
        console.error(
          "Checkout loading error:",
          err
        );

        setError(
          err.response?.data?.message ||
            "Unable to load your checkout."
        );
      } finally {
        setLoading(false);
      }
    }

    loadCheckout();
  }, [
    id,
    setSelectedRestaurant,
  ]);

  /*
   * =========================================================
   * SUBTOTAL
   * =========================================================
   */

  const subtotal = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total +
        Number(
          item.unitPrice || 0
        ) *
          Number(
            item.quantity || 0
          ),
      0
    );
  }, [cart]);

  /*
   * =========================================================
   * ESTIMATED WAIT
   *
   * Uses the longest preparation time because
   * multiple items can be prepared simultaneously.
   * =========================================================
   */

  const estimatedWait = useMemo(() => {
    return cart.reduce(
      (longest, item) => {
        const itemWait =
          Number(
            item.preparation_time ||
              item.preparationTime ||
              0
          );

        const optionWait =
          (
            item.options || []
          ).reduce(
            (
              highest,
              option
            ) =>
              Math.max(
                highest,
                Number(
                  option.preparation_time ||
                    option.preparationTime ||
                    0
                )
              ),
            0
          );

        return Math.max(
          longest,
          itemWait,
          optionWait
        );
      },
      0
    );
  }, [cart]);

  /*
   * =========================================================
   * FORMAT PRICE
   * =========================================================
   */

  function formatPrice(amount) {
    return `₦${Number(
      amount || 0
    ).toLocaleString()}`;
  }

  /*
   * =========================================================
   * PLACE ORDER
   *
   * Payment does NOT happen here.
   * Customer pays after being served.
   * =========================================================
   */

  async function handleOrder() {
    if (cart.length === 0) {
      setError(
        "Your cart is empty."
      );
      return;
    }

    if (!customerName.trim()) {
      setError(
        "Please enter your name."
      );
      return;
    }

    if (!customerPhone.trim()) {
      setError(
        "Please enter your phone number."
      );
      return;
    }

    if (!tableNumber.trim()) {
      setError(
        "Please enter your table number."
      );
      return;
    }

    if (!specialRequest.trim()) {
      setError(
        "Please enter a special request or type “None” if you have none."
      );
      return;
    }

    setProcessing(true);
    setError("");

    try {
      /*
       * Create the order only.
       *
       * No payment is created at checkout.
       */
      const orderResponse =
        await api.post(
          "/orders",
          {
            restaurant_id:
              Number(id),

            customer_id: 1,

            customer_name:
              customerName.trim(),

            customer_phone:
              customerPhone.trim(),

            table_number:
              tableNumber.trim(),

            special_request:
              specialRequest.trim(),

            items: cart.map(
              (item) => ({
                menu_item_id:
                  Number(
                    item.menu_item_id
                  ),

                quantity:
                  Number(
                    item.quantity
                  ),

                option_ids: (
                  item.options ||
                  []
                ).map(
                  (option) =>
                    Number(
                      option.id
                    )
                ),
              })
            ),
          }
        );

      const createdOrder =
        orderResponse.data?.order ||
        orderResponse.data?.data ||
        orderResponse.data;

      if (!createdOrder?.id) {
        throw new Error(
          "Order was created but no order ID was returned."
        );
      }

      /*
       * Save latest order.
       */
      localStorage.setItem(
        `chowly_last_order_${id}`,
        String(
          createdOrder.id
        )
      );

      /*
       * Save the order to the customer's active orders so it
       * stays reachable through "My Orders" - even after
       * navigating away, refreshing, or closing the tab.
       *
       * This only stores the ID locally. The database order was
       * already created by the POST above and is never
       * duplicated here.
       */
      addActiveOrder({
        ...createdOrder,
        restaurant_id:
          Number(id),
        restaurant_name:
          restaurant?.name,
      });

      /*
       * Save order locally for the
       * order confirmation page.
       */
      localStorage.setItem(
        `chowly_order_${createdOrder.id}`,
        JSON.stringify({
          ...createdOrder,

          restaurant_id:
            Number(id),

          restaurant_name:
            restaurant?.name,

          customer_name:
            customerName.trim(),

          customer_phone:
            customerPhone.trim(),

          table_number:
            tableNumber.trim(),

          special_request:
            specialRequest.trim(),

          payment: null,
        })
      );

      /*
       * Clear only this restaurant's cart.
       */
      localStorage.removeItem(
        `chowly_cart_${id}`
      );

      setCart([]);

      /*
       * Go to order tracking.
       */
      navigate(
        `/order/${createdOrder.id}`
      );
    } catch (err) {
      console.error(
        "Order creation error:",
        err
      );

      if (err.response) {
        console.error(
          "Server response:",
          err.response.data
        );

        setError(
          err.response.data?.message ||
            "Something went wrong while placing your order."
        );
      } else {
        setError(
          err.message ||
            "Something went wrong while placing your order."
        );
      }
    } finally {
      setProcessing(false);
    }
  }

  /*
   * =========================================================
   * THEME
   * =========================================================
   */

  const themeStyles = {
    "--restaurant-bg":
      theme?.background ||
      "#f7efcf",

    "--restaurant-surface":
      theme?.surface ||
      "#ffffff",

    "--restaurant-primary":
      theme?.primary ||
      "#3d2929",

    "--restaurant-secondary":
      theme?.secondary ||
      "#d9a6a6",

    "--restaurant-accent":
      theme?.accent ||
      "#b96f6f",

    "--restaurant-text":
      theme?.text ||
      "#2f2f2f",

    "--restaurant-heading-font":
      theme?.fontHeading ||
      "'Playfair Display', serif",

    "--restaurant-body-font":
      theme?.fontBody ||
      "'DM Sans', sans-serif",
  };

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (loading) {
    return (
      <main
        className={`restaurant-page ${
          theme?.style
            ? `restaurant-${theme.style}`
            : ""
        }`}
        style={themeStyles}
      >
        <div className="checkout-page">
          <div className="loading-state">
            Loading checkout...
          </div>
        </div>
      </main>
    );
  }

  /*
   * =========================================================
   * MAIN CHECKOUT
   * =========================================================
   */

  return (
    <main
      className={`restaurant-page ${
        theme?.style
          ? `restaurant-${theme.style}`
          : ""
      }`}
      style={themeStyles}
    >
      <header className="restaurant-header">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            navigate(
              `/restaurant/${id}`
            )
          }
        >
          ← Back to menu
        </button>

        <div className="chowly-wordmark">
          <span>
            {theme?.logo ||
              "🍽️"}
          </span>

          {restaurant?.name ||
            theme?.name ||
            "Chowly"}
        </div>
      </header>

      <section className="checkout-page">
        <div className="checkout-heading">
          <div className="section-eyebrow">
            CHECKOUT
          </div>

          <h1>
            Almost there.
          </h1>

          <p>
            Give us your details and
            place your order. You’ll
            pay after your food has
            been served.
          </p>
        </div>

        {error && (
          <div className="error-state checkout-error">
            <strong>
              Something went wrong
            </strong>

            <p>{error}</p>
          </div>
        )}

        {cart.length === 0 ? (
          <div className="checkout-card empty-cart-state">
            <div className="empty-cart-icon">
              🛒
            </div>

            <h3>
              Your cart is empty
            </h3>

            <p>
              Add something delicious
              before placing your
              order.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={() =>
                navigate(
                  `/restaurant/${id}`
                )
              }
            >
              Back to menu
            </button>
          </div>
        ) : (
          <div className="checkout-layout">
            {/* =================================================
                ORDER SUMMARY
                ================================================= */}

            <section className="checkout-card">
              <div className="checkout-card-header">
                <div>
                  <span className="checkout-card-label">
                    YOUR ORDER
                  </span>

                  <h2>
                    {restaurant?.name}
                  </h2>
                </div>

                <span className="checkout-item-count">
                  {cart.length}{" "}
                  {cart.length === 1
                    ? "item"
                    : "items"}
                </span>
              </div>

              <div className="checkout-items">
                {cart.map(
                  (item) => {
                    const lineTotal =
                      Number(
                        item.unitPrice ||
                          0
                      ) *
                      Number(
                        item.quantity ||
                          0
                      );

                    return (
                      <div
                        className="checkout-item"
                        key={
                          item.key
                        }
                      >
                        <div className="checkout-item-main">
                          <div className="checkout-item-quantity">
                            {
                              item.quantity
                            }×
                          </div>

                          <div>
                            <h3>
                              {
                                item.name
                              }
                            </h3>

                            {item
                              .options
                              ?.length >
                              0 && (
                              <div className="checkout-options">
                                {item.options.map(
                                  (
                                    option
                                  ) => (
                                    <span
                                      key={
                                        option.id
                                      }
                                    >
                                      {
                                        option.name
                                      }

                                      {Number(
                                        option.price ||
                                          0
                                      ) >
                                        0
                                        ? ` · ${formatPrice(
                                            option.price
                                          )}`
                                        : ""}
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <strong>
                          {formatPrice(
                            lineTotal
                          )}
                        </strong>
                      </div>
                    );
                  }
                )}
              </div>

              <div className="checkout-summary">
                <div>
                  <span>
                    Subtotal
                  </span>

                  <strong>
                    {formatPrice(
                      subtotal
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Estimated wait
                  </span>

                  <strong>
                    {estimatedWait >
                    0
                      ? `${estimatedWait} min`
                      : "After order"}
                  </strong>
                </div>

                <div className="checkout-total">
                  <span>
                    Total
                  </span>

                  <strong>
                    {formatPrice(
                      subtotal
                    )}
                  </strong>
                </div>
              </div>
            </section>

            {/* =================================================
                CUSTOMER DETAILS
                ================================================= */}

            <aside className="checkout-sidebar">
              <div className="checkout-card">
                <span className="checkout-card-label">
                  CUSTOMER DETAILS
                </span>

                <h2>
                  Where should we bring it?
                </h2>

                <div className="checkout-form">
                  <label>
                    <span>
                      Name
                    </span>

                    <input
                      type="text"
                      value={
                        customerName
                      }
                      onChange={(
                        event
                      ) =>
                        setCustomerName(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="Your name"
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label>
                    <span>
                      Phone Number
                    </span>

                    <input
                      type="tel"
                      value={
                        customerPhone
                      }
                      onChange={(
                        event
                      ) =>
                        setCustomerPhone(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="08012345678"
                      autoComplete="tel"
                      required
                    />
                  </label>

                  <label>
                    <span>
                      Table Number
                    </span>

                    <input
                      type="text"
                      value={
                        tableNumber
                      }
                      onChange={(
                        event
                      ) =>
                        setTableNumber(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="e.g. 12"
                      required
                    />
                  </label>

                  <label>
                    <span>
                      Special Request / Note
                    </span>

                    <textarea
                      value={
                        specialRequest
                      }
                      onChange={(
                        event
                      ) =>
                        setSpecialRequest(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="Any special request? Type “None” if you have none."
                      rows={4}
                      required
                    />
                  </label>
                </div>

                <div className="pretend-payment-notice">
                  <strong>
                    Pay after your meal
                  </strong>

                  <span>
                    Your order will be
                    prepared and served
                    first. Payment will
                    be recorded after you
                    receive your food.
                  </span>
                </div>

                <button
                  type="button"
                  className="checkout-pay-button"
                  onClick={
                    handleOrder
                  }
                  disabled={
                    processing
                  }
                >
                  {processing
                    ? "PLACING ORDER..."
                    : `PLACE ORDER · ${formatPrice(
                        subtotal
                      )}`}
                </button>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

export default Checkout;