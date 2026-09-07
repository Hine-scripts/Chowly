import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import { useChowly } from "../context/ChowlyContext";
import RoleSwitcher from "../components/RoleSwitcher";

function formatPrice(value) {
  return `₦${Number(value || 0).toLocaleString()}`;
}

function getCategoryName(item) {
  return item.category_name || item.category?.name || "Menu";
}

function isDrinkItem(item) {
  const itemType = String(
    item.menu_type ||
      item.menuType ||
      item.item_type ||
      item.itemType ||
      ""
  ).toLowerCase();

  if (itemType === "drink" || itemType === "drinks" || itemType === "beverage") {
    return true;
  }

  const categoryName = getCategoryName(item).toLowerCase();

  return (
    categoryName.includes("drink") ||
    categoryName.includes("beverage") ||
    categoryName.includes("drinks")
  );
}

/*
 * =========================================================
 * OPTION TYPES
 *
 * menu_options.option_type is the authoritative source
 * that decides how customization options are grouped and
 * constrained. Legacy fields such as option_group_name,
 * option_group_id and group_name are NOT used.
 *
 * The Chowly "flavor" spelling is normalized to "flavour".
 * =========================================================
 */

function getRawOptionType(option) {
  return String(option.option_type || option.optionType || "").trim();
}

function getOptionTypeKey(option) {
  const type = getRawOptionType(option).toLowerCase();

  if (type === "flavor") {
    return "flavour";
  }

  return type;
}

const OPTION_TYPE_LABELS = {
  flavour: "Flavours",
  topping: "Toppings",
  soup: "Soup",
  protein: "Protein",
  dip: "Dip",
  swallow: "Swallows",
};

function getOptionGroupName(typeKey, option) {
  if (OPTION_TYPE_LABELS[typeKey]) {
    return OPTION_TYPE_LABELS[typeKey];
  }

  const raw = getRawOptionType(option);

  if (raw) {
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  return "Options";
}

/*
 * =========================================================
 * LOCKED CHOWLY CUSTOMIZATION RULES
 * =========================================================
 *
 * Ice cream flavours:
 * - Maximum 2
 *
 * Toppings:
 * - Maximum 15
 *
 * Swallows:
 * - Exactly 1 soup (required)
 * - Up to 3 proteins
 *
 * Rice:
 * - Up to 3 proteins
 *
 * Spaghetti:
 * - Up to 3 proteins
 *
 * Chips & Dip:
 * - Exactly 1 dip (required)
 * =========================================================
 */

function getOptionGroupRules(typeKey, groupOptions) {
  switch (typeKey) {
    case "flavour":
      return {
        min: 0,
        max: 2,
        required: false,
        label: "Choose up to 2",
      };

    case "topping":
      return {
        min: 0,
        max: 15,
        required: false,
        label: "Choose up to 15",
      };

    case "soup":
      return {
        min: 1,
        max: 1,
        required: true,
        label: "Choose exactly 1",
      };

    case "protein":
      return {
        min: 0,
        max: 3,
        required: false,
        label: "Choose up to 3",
      };

    case "dip":
      return {
        min: 1,
        max: 1,
        required: true,
        label: "Choose exactly 1",
      };

    case "swallow":
      return {
        min: 0,
        max: 1,
        required: false,
        label: "Choose 1",
      };

    default: {
      const required = (groupOptions || []).some(
        (option) =>
          Boolean(option.required) ||
          String(option.required) === "true"
      );

      return {
        min: required ? 1 : 0,
        max: null,
        required,
        label: required
          ? "Choose at least 1"
          : "Choose as many as you like",
      };
    }
  }
}

export default function Restaurant() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    selectedRestaurant,
    setSelectedRestaurant,
    theme,
    role,
  } = useChowly();

  const [restaurant, setRestaurant] =
    useState(selectedRestaurant);

  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const [customizationItem, setCustomizationItem] =
    useState(null);

  const [selectedOptions, setSelectedOptions] =
    useState([]);

  const [customizationQuantity, setCustomizationQuantity] =
    useState(1);

  /*
   * =========================================================
   * RESTAURANT THEME VARIABLES
   * =========================================================
   */

  const themeStyles = {
    "--restaurant-bg": theme?.background || "#f7efcf",
    "--restaurant-surface": theme?.surface || "#ffffff",
    "--restaurant-primary": theme?.primary || "#3d2929",
    "--restaurant-secondary": theme?.secondary || "#d9a6a6",
    "--restaurant-accent": theme?.accent || "#b96f6f",
    "--restaurant-text": theme?.text || "#2f2f2f",
    "--restaurant-heading-font": theme?.fontHeading || "'Playfair Display', serif",
    "--restaurant-body-font": theme?.fontBody || "'DM Sans', sans-serif",
  };

  /*
   * =========================================================
   * REDIRECT STAFF ROLES TO STAFF SECTION
   * =========================================================
   */

  useEffect(() => {
    const staffRoles = ["WAITER", "CHEF", "BARTENDER", "ADMIN"];

    if (role === "STAFF" || staffRoles.includes(role)) {
      navigate(`/restaurant/${id}/staff`, { replace: true });
    }
  }, [role, id, navigate]);

  /*
   * =========================================================
   * LOAD RESTAURANT
   * =========================================================
   */

  useEffect(() => {
    async function loadRestaurant() {
      try {
        setLoading(true);
        setError("");

        const restaurantResponse = await api.get(`/restaurants/${id}`);

        const restaurantData =
          restaurantResponse.data?.restaurant ||
          restaurantResponse.data?.data ||
          restaurantResponse.data;

        setRestaurant(restaurantData);
        setSelectedRestaurant(restaurantData);
      } catch (err) {
        console.error("Failed to load restaurant:", err);

        setError(
          err.response?.data?.message || "Could not load this restaurant."
        );
      } finally {
        setLoading(false);
      }
    }

    loadRestaurant();
  }, [id, setSelectedRestaurant]);

  /*
   * =========================================================
   * LOAD MENU
   * =========================================================
   */

  useEffect(() => {
    async function loadMenu() {
      try {
        const response = await api.get(`/menu?restaurant_id=${id}`);

        const menuData =
          response.data?.menuItems ||
          response.data?.menu ||
          response.data?.data ||
          [];

        setMenu(Array.isArray(menuData) ? menuData : []);
      } catch (err) {
        console.error("Failed to load menu:", err);

        setError(
          err.response?.data?.message || "Could not load the restaurant menu."
        );
      }
    }

    loadMenu();
  }, [id]);

  /*
   * =========================================================
   * RESTORE CART FOR THIS RESTAURANT
   * =========================================================
   */

  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(`chowly_cart_${id}`);

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);

        setCart(Array.isArray(parsedCart) ? parsedCart : []);
      } else {
        setCart([]);
      }
    } catch (err) {
      console.error("Could not restore cart:", err);

      setCart([]);
    }
  }, [id]);

  /*
   * =========================================================
   * SAVE CART FOR THIS RESTAURANT
   * =========================================================
   */

  useEffect(() => {
    try {
      localStorage.setItem(`chowly_cart_${id}`, JSON.stringify(cart));
    } catch (err) {
      console.error("Could not save cart:", err);
    }
  }, [cart, id]);

  /*
   * =========================================================
   * MENU TAB
   *
   * Chowly Kitchen + Lagos Bistro:
   * FOOD | DRINKS
   *
   * Harlow Creamery:
   * No tabs.
   * =========================================================
   */

  const hasMenuTabs = Number(id) === 1 || Number(id) === 3;

  const [menuTab, setMenuTab] = useState("FOOD");

  useEffect(() => {
    if (hasMenuTabs) {
      setMenuTab("FOOD");
    }
  }, [id, hasMenuTabs]);

  /*
   * =========================================================
   * FILTER MENU BY TAB
   * =========================================================
   */

  const filteredMenu = useMemo(() => {
    if (!hasMenuTabs) {
      return menu;
    }

    if (menuTab === "DRINKS") {
      return menu.filter((item) => isDrinkItem(item));
    }

    return menu.filter((item) => !isDrinkItem(item));
  }, [menu, menuTab, hasMenuTabs]);

  /*
   * =========================================================
   * GROUP FILTERED MENU BY CATEGORY
   * =========================================================
   */

  const groupedMenu = useMemo(() => {
    const groups = {};

    filteredMenu.forEach((item) => {
      const categoryName = getCategoryName(item);

      if (!groups[categoryName]) {
        groups[categoryName] = [];
      }

      groups[categoryName].push(item);
    });

    return groups;
  }, [filteredMenu]);

  /*
   * =========================================================
   * CART TOTAL
   * =========================================================
   */

  const cartTotal = useMemo(() => {
    return cart.reduce(
      (total, item) => total + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0
    );
  }, [cart]);

  /*
   * =========================================================
   * CART ITEM COUNT
   * =========================================================
   */

  const cartItemCount = useMemo(() => {
    return cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
  }, [cart]);

  /*
   * =========================================================
   * OPEN CUSTOMIZATION
   * =========================================================
   */

  function openCustomization(item) {
    const options = item.options || [];

    if (!options.length) {
      addItemToCart(item, []);
      return;
    }

    setCustomizationItem(item);
    setSelectedOptions([]);
    setCustomizationQuantity(1);
  }

  /*
   * =========================================================
   * GET OPTIONS GROUPED BY OPTION TYPE
   * =========================================================
   */

  function getOptionGroups(item) {
    const groups = {};
    const itemOptions = item.options || [];

    itemOptions.forEach((option) => {
      const typeKey = getOptionTypeKey(option);

      if (!groups[typeKey]) {
        const groupOptions = itemOptions.filter(
          (candidate) => getOptionTypeKey(candidate) === typeKey
        );

        const rules = getOptionGroupRules(typeKey, groupOptions);

        groups[typeKey] = {
          id: typeKey,
          name: getOptionGroupName(typeKey, option),
          min: rules.min,
          max: rules.max,
          required: rules.required,
          label: rules.label,
          options: [],
        };
      }

      groups[typeKey].options.push(option);
    });

    return Object.values(groups);
  }

  /*
   * =========================================================
   * TOGGLE OPTION
   * =========================================================
   */

  function toggleOption(option, group) {
    setSelectedOptions((current) => {
      const alreadySelected = current.some(
        (selected) => selected.id === option.id
      );

      if (alreadySelected) {
        return current.filter((selected) => selected.id !== option.id);
      }

      const selectedInGroup = current.filter(
        (selected) => getOptionTypeKey(selected) === group.id
      );

      /*
       * No maximum means unlimited selection.
       */
      if (group.max !== null && selectedInGroup.length >= group.max) {
        return current;
      }

      return [...current, option];
    });
  }

  /*
   * =========================================================
   * CHECK IF CUSTOMIZATION IS VALID
   *
   * Required groups (soup, dip) must have their minimum
   * selection before the item can be added to the cart.
   * =========================================================
   */

  function customizationIsValid() {
    if (!customizationItem) {
      return false;
    }

    const groups = getOptionGroups(customizationItem);

    return groups.every((group) => {
      const count = selectedOptions.filter(
        (option) => getOptionTypeKey(option) === group.id
      ).length;

      const meetsMinimum = count >= group.min;
      const meetsMaximum = group.max === null || count <= group.max;

      return meetsMinimum && meetsMaximum;
    });
  }

  /*
   * =========================================================
   * ADD ITEM TO CART
   *
   * Preparation time is saved with the cart item.
   * =========================================================
   */

  function addItemToCart(item, options) {
    const optionIds = options.map((option) => option.id).sort((a, b) => a - b);

    const key = `${item.id}-${optionIds.join("-")}`;

    const optionPrice = options.reduce(
      (total, option) => total + Number(option.price || 0),
      0
    );

    const unitPrice = Number(item.price || 0) + optionPrice;

    const quantity = customizationItem?.id === item.id ? customizationQuantity : 1;

    const cartOptions = options.map((option) => ({
      ...option,
      preparation_time: Number(option.preparation_time ?? option.preparationTime ?? 0),
    }));

    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex(
        (cartItem) => cartItem.key === key
      );

      if (existingIndex !== -1) {
        return currentCart.map((cartItem, index) =>
          index === existingIndex
            ? {
                ...cartItem,
                quantity: Number(cartItem.quantity || 0) + quantity,
                preparation_time: Number(
                  item.preparation_time ??
                    item.preparationTime ??
                    cartItem.preparation_time ??
                    cartItem.preparationTime ??
                    0
                ),
                options: cartOptions,
              }
            : cartItem
        );
      }

      return [
        ...currentCart,
        {
          key,
          menu_item_id: item.id,
          name: item.name,
          quantity,
          unitPrice,
          preparation_time: Number(item.preparation_time ?? item.preparationTime ?? 0),
          options: cartOptions,
        },
      ];
    });

    setCustomizationItem(null);
    setSelectedOptions([]);
    setCustomizationQuantity(1);
  }

  /*
   * =========================================================
   * ADD CUSTOMIZED ITEM
   * =========================================================
   */

  function confirmCustomization() {
    if (!customizationItem) {
      return;
    }

    if (!customizationIsValid()) {
      return;
    }

    addItemToCart(customizationItem, selectedOptions);
  }

  /*
   * =========================================================
   * CHANGE CART QUANTITY
   * =========================================================
   */

  function changeCartQuantity(key, amount) {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.key !== key) {
            return item;
          }

          return {
            ...item,
            quantity: Number(item.quantity || 0) + amount,
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  /*
   * =========================================================
   * REMOVE CART ITEM
   * =========================================================
   */

  function removeCartItem(key) {
    setCart((currentCart) => currentCart.filter((item) => item.key !== key));
  }

  /*
   * =========================================================
   * CLOSE CART
   * =========================================================
   */

  function closeCart() {
    setCartOpen(false);
  }

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (loading) {
    return (
      <div className="restaurant-page" style={themeStyles}>
        <div className="loading-state">Loading restaurant...</div>
      </div>
    );
  }

  /*
   * =========================================================
   * ERROR
   * =========================================================
   */

  if (error || !restaurant) {
    return (
      <div className="restaurant-page" style={themeStyles}>
        <div className="error-state">
          <h2>Something went wrong</h2>

          <p>{error || "We could not find this restaurant."}</p>

          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/restaurants")}
          >
            Back to restaurants
          </button>
        </div>
      </div>
    );
  }

  /*
   * =========================================================
   * MAIN RESTAURANT PAGE
   * =========================================================
   */

  return (
    <div
      className={`restaurant-page restaurant-${theme?.style || "cozy"}`}
      style={themeStyles}
    >
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="restaurant-header">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate("/restaurants")}
        >
          ← Restaurants
        </button>

        <div className="restaurant-header-brand">
          <div className="restaurant-header-logo">{theme?.logo || "🍴"}</div>

          <div>
            <h1>{restaurant.name}</h1>

            <p>{theme?.tagline || "Good food. Good mood."}</p>
          </div>
        </div>

        <div className="restaurant-header-actions">
          <RoleSwitcher />

          <button
            type="button"
            className="cart-button"
            onClick={() => setCartOpen(true)}
          >
            🛒 Cart

            {cartItemCount > 0 && <span className="cart-count">{cartItemCount}</span>}
          </button>
        </div>
      </header>

      {/* =====================================================
          RESTAURANT CONTENT
          ===================================================== */}

      <main className="restaurant-content">
        <section className="restaurant-intro">
          <span className="section-eyebrow">TODAY'S MENU</span>

          <h2>
            What are you craving?
          </h2>

          <p>
            Browse the menu, customize your order, and we'll take care of the
            rest.
          </p>
        </section>

        {/* ===================================================
            MENU TABS
            =================================================== */}

        {hasMenuTabs && (
          <div className="menu-tabs">
            <button
              type="button"
              className={`menu-tab ${menuTab === "FOOD" ? "active" : ""}`}
              onClick={() => setMenuTab("FOOD")}
            >
              FOOD
            </button>

            <button
              type="button"
              className={`menu-tab ${menuTab === "DRINKS" ? "active" : ""}`}
              onClick={() => setMenuTab("DRINKS")}
            >
              DRINKS
            </button>
          </div>
        )}

        <section className="menu-sections">
          {Object.entries(groupedMenu).length === 0 ? (
            <div className="empty-menu-state">
              <h3>No items here yet</h3>

              <p>There are currently no menu items in this section.</p>
            </div>
          ) : (
            Object.entries(groupedMenu).map(([categoryName, items]) => (
              <section className="menu-category" key={categoryName}>
                <div className="menu-category-heading">
                  <h3>{categoryName}</h3>
                </div>

                <div className="menu-grid">
                  {[...items]
                    .sort((a, b) => {
                      if (Number(id) !== 2) {
                        return 0;
                      }

                      const getSizeOrder = (name) => {
                        const normalizedName = String(name || "")
                          .trim()
                          .toLowerCase();

                        if (normalizedName.includes("small")) return 1;
                        if (normalizedName.includes("medium")) return 2;
                        if (normalizedName.includes("extra large")) return 4;
                        if (normalizedName.includes("large")) return 3;

                        return 999;
                      };

                      return getSizeOrder(a.name) - getSizeOrder(b.name);
                    })
                    .map((item) => (
                      <article className="menu-card" key={item.id}>
                        <div>
                          <div className="menu-card-top">
                            <h4>{item.name}</h4>

                            <span className="menu-price">{formatPrice(item.price)}</span>
                          </div>

                          {item.description && (
                            <p className="menu-description">{item.description}</p>
                          )}

                          {item.preparation_time != null && item.preparation_time > 0 && (
                            <span className="menu-prep-time">
                              ~{item.preparation_time} min preparation
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="menu-add-button"
                          onClick={() => openCustomization(item)}
                        >
                          {item.options?.length ? "CUSTOMIZE & ADD" : "ADD TO ORDER"}
                        </button>
                      </article>
                    ))}
                </div>
              </section>
            ))
          )}
        </section>
      </main>

      {/* =====================================================
          CUSTOMIZATION MODAL
          ===================================================== */}

      {customizationItem && (
        <div
          className="modal-backdrop"
          onClick={() => setCustomizationItem(null)}
        >
          <div
            className="customization-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="section-eyebrow">CUSTOMIZE</span>

                <h2>{customizationItem.name}</h2>

                <p>
                  Choose your options before adding this item to your order.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setCustomizationItem(null)}
              >
                ×
              </button>
            </div>

            <div className="customization-content">
              {getOptionGroups(customizationItem).map((group) => {
                const groupSelected = selectedOptions.filter(
                  (option) => getOptionTypeKey(option) === group.id
                );

                return (
                  <div className="option-group" key={group.id || group.name}>
                    <div className="option-group-heading">
                      <h3>{group.name}</h3>

                      <span
                        className={
                          groupSelected.length >= group.min
                            ? "option-selection-count"
                            : ""
                        }
                      >
                        {group.label}
                      </span>
                    </div>

                    <div className="option-grid">
                      {group.options.map((option) => {
                        const isSelected = selectedOptions.some(
                          (selected) => selected.id === option.id
                        );

                        return (
                          <button
                            type="button"
                            key={option.id}
                            className={`option-button ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() => toggleOption(option, group)}
                          >
                            <span className="option-button-name">{option.name}</span>

                            {Number(option.price || 0) > 0 && (
                              <span className="option-button-price">
                                +{formatPrice(option.price)}
                              </span>
                            )}

                            {isSelected && (
                              <span className="option-button-check">✓</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <div className="modal-quantity">
                <button
                  type="button"
                  onClick={() =>
                    setCustomizationQuantity((quantity) =>
                      Math.max(1, quantity - 1)
                    )
                  }
                >
                  −
                </button>

                <span>{customizationQuantity}</span>

                <button
                  type="button"
                  onClick={() =>
                    setCustomizationQuantity((quantity) => quantity + 1)
                  }
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="modal-add-button"
                disabled={!customizationIsValid()}
                onClick={confirmCustomization}
              >
                ADD TO ORDER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          CART
          ===================================================== */}

      {cartOpen && (
        <div className="cart-backdrop" onClick={closeCart}>
          <aside
            className="cart-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cart-header">
              <div>
                <span className="section-eyebrow">YOUR ORDER</span>

                <h2>Cart</h2>
              </div>

              <button type="button" className="modal-close" onClick={closeCart}>
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart">
                <div className="empty-cart-icon">🛒</div>

                <h3>Your cart is empty</h3>

                <p>Add something delicious from the menu to get started.</p>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeCart}
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <div className="cart-item" key={item.key}>
                      <div className="cart-item-info">
                        <h3>{item.name}</h3>

                        {item.options?.length > 0 && (
                          <p>
                            {item.options
                              .map((option) => option.name)
                              .join(", ")}
                          </p>
                        )}

                        <strong>{formatPrice(item.unitPrice * item.quantity)}</strong>
                      </div>

                      <div className="cart-item-actions">
                        <div className="cart-quantity">
                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.key, -1)}
                          >
                            −
                          </button>

                          <span>{item.quantity}</span>

                          <button
                            type="button"
                            onClick={() => changeCartQuantity(item.key, 1)}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="cart-remove"
                          onClick={() => removeCartItem(item.key)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-footer">
                  <div className="cart-total">
                    <span>Total</span>

                    <strong>{formatPrice(cartTotal)}</strong>
                  </div>

                  <button
                    type="button"
                    className="modal-add-button"
                    onClick={() => navigate(`/restaurant/${id}/checkout`)}
                  >
                    CONTINUE TO CHECKOUT
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}