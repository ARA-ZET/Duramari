/**
 * A starter list of common household grocery items, so building a list
 * doesn't mean typing "Milk", "Bread", "Rice"… from scratch every time.
 * Anything not here is still just a free-text "Custom item" away.
 */

export type SizeUnit = "weight" | "volume" | "count";

export interface CatalogItem {
  name: string;
  category: string;
  unit: SizeUnit;
}

/** Sizes offered per unit type — one dropdown shape shared by every item of that kind. */
export const SIZE_OPTIONS: Record<SizeUnit, string[]> = {
  weight: ["250g", "500g", "750g", "1kg", "2kg", "2.5kg", "5kg", "10kg"],
  volume: ["250ml", "500ml", "750ml", "1L", "2L", "5L"],
  count: ["1", "2", "3", "4", "6", "9", "12", "18", "24", "30"],
};

/** A reasonable size to pre-select before the user picks their own. */
export const DEFAULT_SIZE: Record<SizeUnit, string> = {
  weight: "1kg",
  volume: "1L",
  count: "6",
};

export const GROCERY_CATALOG: CatalogItem[] = [
  // Grains & staples
  { name: "Maize meal", category: "Grains & Staples", unit: "weight" },
  { name: "Rice", category: "Grains & Staples", unit: "weight" },
  { name: "Sugar", category: "Grains & Staples", unit: "weight" },
  { name: "Salt", category: "Grains & Staples", unit: "weight" },
  { name: "Cooking oil", category: "Grains & Staples", unit: "volume" },
  { name: "Sugar beans", category: "Grains & Staples", unit: "weight" },
  { name: "Samp", category: "Grains & Staples", unit: "weight" },
  { name: "Oats", category: "Grains & Staples", unit: "weight" },
  { name: "Cake flour", category: "Grains & Staples", unit: "weight" },
  { name: "Bread flour", category: "Grains & Staples", unit: "weight" },
  { name: "Spaghetti / pasta", category: "Grains & Staples", unit: "weight" },
  { name: "Peanut butter", category: "Grains & Staples", unit: "weight" },

  // Dairy & eggs
  { name: "Milk", category: "Dairy & Eggs", unit: "volume" },
  { name: "Eggs", category: "Dairy & Eggs", unit: "count" },
  { name: "Butter", category: "Dairy & Eggs", unit: "weight" },
  { name: "Margarine", category: "Dairy & Eggs", unit: "weight" },
  { name: "Cheese", category: "Dairy & Eggs", unit: "weight" },
  { name: "Yoghurt", category: "Dairy & Eggs", unit: "volume" },

  // Meat & protein
  { name: "Chicken", category: "Meat & Protein", unit: "weight" },
  { name: "Beef", category: "Meat & Protein", unit: "weight" },
  { name: "Mince", category: "Meat & Protein", unit: "weight" },
  { name: "Pork", category: "Meat & Protein", unit: "weight" },
  { name: "Fish", category: "Meat & Protein", unit: "weight" },
  { name: "Boerewors / sausage", category: "Meat & Protein", unit: "weight" },
  { name: "Bacon", category: "Meat & Protein", unit: "weight" },

  // Fruit & veg
  { name: "Potatoes", category: "Fruit & Veg", unit: "weight" },
  { name: "Onions", category: "Fruit & Veg", unit: "weight" },
  { name: "Tomatoes", category: "Fruit & Veg", unit: "weight" },
  { name: "Carrots", category: "Fruit & Veg", unit: "weight" },
  { name: "Butternut", category: "Fruit & Veg", unit: "weight" },
  { name: "Cabbage", category: "Fruit & Veg", unit: "count" },
  { name: "Spinach / rape", category: "Fruit & Veg", unit: "count" },
  { name: "Bananas", category: "Fruit & Veg", unit: "count" },
  { name: "Apples", category: "Fruit & Veg", unit: "count" },
  { name: "Oranges", category: "Fruit & Veg", unit: "count" },
  { name: "Avocados", category: "Fruit & Veg", unit: "count" },

  // Bakery
  { name: "Bread", category: "Bakery", unit: "count" },
  { name: "Bread rolls", category: "Bakery", unit: "count" },
  { name: "Buns", category: "Bakery", unit: "count" },

  // Beverages
  { name: "Tea bags", category: "Beverages", unit: "count" },
  { name: "Coffee", category: "Beverages", unit: "weight" },
  { name: "Juice", category: "Beverages", unit: "volume" },
  { name: "Bottled water", category: "Beverages", unit: "volume" },
  { name: "Maheu", category: "Beverages", unit: "volume" },
  { name: "Cordial / squash", category: "Beverages", unit: "volume" },

  // Household & cleaning
  { name: "Dishwashing liquid", category: "Household & Cleaning", unit: "volume" },
  { name: "Washing powder", category: "Household & Cleaning", unit: "weight" },
  { name: "Bar soap", category: "Household & Cleaning", unit: "count" },
  { name: "Toilet paper", category: "Household & Cleaning", unit: "count" },
  { name: "Bleach", category: "Household & Cleaning", unit: "volume" },
  { name: "Refuse bags", category: "Household & Cleaning", unit: "count" },
  { name: "Sponges", category: "Household & Cleaning", unit: "count" },

  // Personal care
  { name: "Toothpaste", category: "Personal Care", unit: "count" },
  { name: "Bath soap", category: "Personal Care", unit: "count" },
  { name: "Deodorant", category: "Personal Care", unit: "count" },
  { name: "Shampoo", category: "Personal Care", unit: "volume" },
  { name: "Sanitary pads", category: "Personal Care", unit: "count" },
];
