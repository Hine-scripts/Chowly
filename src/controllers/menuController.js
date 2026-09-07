const pool = require("../config/database");


// ============================================
// GET MENU ITEMS
// ============================================
const getMenuItems = async (req, res) => {
  try {
    const { restaurant_id } = req.query;

    if (!restaurant_id) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id is required",
      });
    }

    const result = await pool.query(
      `
      SELECT
        mi.id,
        mi.restaurant_id,
        mi.name,
        mi.description,
        mi.price,
        mi.preparation_time,
        mi.item_type,
        mi.available,

        c.id AS category_id,
        c.name AS category_name,
        c.parent_category_id,

        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', mo.id,
              'name', mo.name,
              'option_type', mo.option_type,
              'price', mo.price,
              'preparation_time', mo.preparation_time,
              'available', mo.available,
              'required', mio.required,
              'max_quantity', mio.max_quantity
            )
          ) FILTER (WHERE mo.id IS NOT NULL),
          '[]'::json
        ) AS options

      FROM menu_items mi

      INNER JOIN categories c
        ON mi.category_id = c.id

      LEFT JOIN menu_item_options mio
        ON mio.menu_item_id = mi.id

      LEFT JOIN menu_options mo
        ON mo.id = mio.menu_option_id

      WHERE mi.restaurant_id = $1

      GROUP BY
        mi.id,
        mi.restaurant_id,
        mi.name,
        mi.description,
        mi.price,
        mi.preparation_time,
        mi.item_type,
        mi.available,
        c.id,
        c.name,
        c.parent_category_id

      ORDER BY
        c.parent_category_id NULLS FIRST,
        c.name ASC,
        mi.name ASC
      `,
      [restaurant_id]
    );

    const menuItems = result.rows.map((item) => {
      const itemType = String(
        item.item_type || ""
      ).trim().toUpperCase();

      const categoryName = String(
        item.category_name || ""
      ).trim().toLowerCase();

      const isDrink =
        itemType === "DRINK" ||
        itemType === "DRINKS" ||
        itemType === "BEVERAGE" ||
        itemType === "BEVERAGES" ||
        categoryName.includes("drink") ||
        categoryName.includes("beverage");

      return {
        ...item,

        // Normalized type used by the frontend.
        menu_type: isDrink ? "DRINKS" : "FOOD",

        // Keep the original database value available.
        item_type: item.item_type,
      };
    });

    return res.json({
      success: true,
      menuItems,
    });
  } catch (error) {
    console.error(
      "Error fetching menu items:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch menu items",
    });
  }
};


// ============================================
// CREATE MENU ITEM
// ============================================
const createMenuItem = async (req, res) => {
  try {
    const {
      restaurant_id,
      category_id,
      name,
      description,
      price,
      preparation_time,
      item_type,
    } = req.body;

    if (
      !restaurant_id ||
      !category_id ||
      !name ||
      price === undefined ||
      preparation_time === undefined ||
      !item_type
    ) {
      return res.status(400).json({
        success: false,
        message:
          "restaurant_id, category_id, name, price, preparation_time and item_type are required",
      });
    }

    const normalizedItemType = String(
      item_type
    )
      .trim()
      .toUpperCase();

    const allowedItemTypes = [
      "FOOD",
      "DRINK",
      "DRINKS",
      "BEVERAGE",
      "BEVERAGES",
    ];

    if (
      !allowedItemTypes.includes(
        normalizedItemType
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "item_type must identify the item as FOOD or DRINKS",
      });
    }

    const restaurantResult = await pool.query(
      `
      SELECT id
      FROM restaurants
      WHERE id = $1
      `,
      [restaurant_id]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    const categoryResult = await pool.query(
      `
      SELECT id
      FROM categories
      WHERE id = $1
        AND restaurant_id = $2
      `,
      [
        category_id,
        restaurant_id,
      ]
    );

    if (categoryResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Category does not belong to this restaurant",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO menu_items
      (
        restaurant_id,
        category_id,
        name,
        description,
        price,
        preparation_time,
        item_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        restaurant_id,
        category_id,
        name.trim(),
        description
          ? description.trim()
          : null,
        price,
        preparation_time,
        normalizedItemType,
      ]
    );

    const menuItem = result.rows[0];

    const normalizedType =
      ["DRINK", "DRINKS", "BEVERAGE", "BEVERAGES"]
        .includes(normalizedItemType)
        ? "DRINKS"
        : "FOOD";

    return res.status(201).json({
      success: true,
      menuItem: {
        ...menuItem,
        menu_type: normalizedType,
      },
    });
  } catch (error) {
    console.error(
      "Error creating menu item:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create menu item",
    });
  }
};


module.exports = {
  getMenuItems,
  createMenuItem,
};