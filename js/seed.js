export function createSeedData() {
  return {
    categories: [],
    stores: [],
    catalog: {
      coffee: { id: "coffee", name: "Coffee", category: "", stores: [], tags: [] },
      milk: { id: "milk", name: "Milk", category: "", stores: [], tags: [] },
      eggs: { id: "eggs", name: "Eggs", category: "", stores: [], tags: [] },
      bread: { id: "bread", name: "Bread", category: "", stores: [], tags: [] },
    },
    collections: {
      house: {
        id: "house",
        label: "House",
        items: {
          coffee: { id: "coffee", baseId: "coffee", needed: false },
          milk: { id: "milk", baseId: "milk", needed: false },
          eggs: { id: "eggs", baseId: "eggs", needed: false },
          bread: { id: "bread", baseId: "bread", needed: false },
        },
      },
    },
    trip: {
      items: [],
    },
  };
}
