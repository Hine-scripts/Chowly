const pool = require("../config/database");

const getMealComponents = async (req, res) => {
  try {
    const { restaurant_id } = req.query;

    if (!restaurant_id) {
      return res.status(400).json({
        success: false,
        message: "restaurant_id is required",
      });
    }

    const mealsResult = await pool.query(
      `SELECT id, name, description
       FROM meal_components
       WHERE restaurant_id = $1
       ORDER BY id`,
      [restaurant_id]
    );

    const meals = [];

    for (const meal of mealsResult.rows) {
      const rulesResult = await pool.query(
        `SELECT
            mcr.id,
            mcr.category_id,
            mcr.option_group_id,
            mcr.min_selections,
            mcr.max_selections,
            c.name AS category_name,
            mog.name AS option_group_name
         FROM meal_component_rules mcr
         LEFT JOIN categories c
           ON mcr.category_id = c.id
         LEFT JOIN menu_option_groups mog
           ON mcr.option_group_id = mog.id
         WHERE mcr.meal_component_id = $1
         ORDER BY mcr.id`,
        [meal.id]
      );

      const components = [];

      for (const rule of rulesResult.rows) {
        let options = [];

        if (rule.category_id) {
          const result = await pool.query(
            `SELECT
                id,
                name,
                description,
                price,
                preparation_time,
                item_type,
                available
             FROM menu_items
             WHERE restaurant_id = $1
               AND category_id = $2
               AND available = TRUE
             ORDER BY name`,
            [restaurant_id, rule.category_id]
          );

          options = result.rows;
        }

        if (rule.option_group_id) {
          const result = await pool.query(
            `SELECT
                id,
                name,
                option_type,
                price,
                preparation_time,
                available
             FROM menu_options
             WHERE restaurant_id = $1
               AND option_group_id = $2
               AND available = TRUE
             ORDER BY name`,
            [restaurant_id, rule.option_group_id]
          );

          options = result.rows;
        }

        components.push({
          id: rule.id,
          name: rule.category_name || rule.option_group_name,
          min_selections: rule.min_selections,
          max_selections: rule.max_selections,
          options,
        });
      }

      meals.push({
        id: meal.id,
        name: meal.name,
        description: meal.description,
        components,
      });
    }

    res.json({
      success: true,
      meals,
    });
  } catch (error) {
    console.error("Error fetching meal components:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch meal components",
    });
  }
};

module.exports = {
  getMealComponents,
};