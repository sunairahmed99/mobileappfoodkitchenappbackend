import Category from '../Models/Category.js';
import Banner from '../Models/Banner.js';
import Deal from '../Models/Deal.js';
import FoodItem from '../Models/FoodItem.js';
import User from '../Models/User.js';
import Voucher from '../Models/Voucher.js';
import Blog from '../Models/Blog.js';
import { recomputeCatalogStats } from '../Utils/catalogStats.js';

const INITIAL_CATEGORIES = [
  {
    name: 'All Foods',
    imageUrl:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80',
    itemCount: 38,
    order: 0,
    isActive: true,
  },
  {
    name: 'Biryani & Rice',
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=300&q=80',
    itemCount: 8,
    order: 1,
    isActive: true,
  },
  {
    name: 'Burgers & Wraps',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80',
    itemCount: 6,
    order: 2,
    isActive: true,
  },
  {
    name: 'Pizza & Pasta',
    imageUrl:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80',
    itemCount: 5,
    order: 3,
    isActive: true,
  },
  {
    name: 'BBQ & Grills',
    imageUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=300&q=80',
    itemCount: 7,
    order: 4,
    isActive: true,
  },
  {
    name: 'Karahi & Handi',
    imageUrl:
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=300&q=80',
    itemCount: 6,
    order: 5,
    isActive: true,
  },
  {
    name: 'Desserts & Sweets',
    imageUrl:
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=300&q=80',
    itemCount: 4,
    order: 6,
    isActive: true,
  },
];

const INITIAL_BANNERS = [
  {
    title: 'Special Hyderabadi Dum Biryani',
    subtitle: 'Slow cooked aromatic basmati with tender spiced mutton & chicken',
    tag: 'CHEF CHOICE',
    discount: '30% OFF',
    buttonText: 'Order Now',
    backgroundColor: '#1E1B18',
    accentColor: '#EE4D2D',
    imageUrl:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 0,
  },
  {
    title: 'Double Smash Burgers & Fries',
    subtitle: 'Juicy Angus beef patties, caramelized onions & melted cheddar',
    tag: 'FAST FOOD',
    discount: '25% OFF',
    buttonText: 'Grab Deal',
    backgroundColor: '#1A1D20',
    accentColor: '#FF9500',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 1,
  },
  {
    title: 'Fresh Homemade Thali Meals',
    subtitle: 'Complete home-style meal box with daal, curry, rotis & salad',
    tag: 'HOMESTYLE',
    discount: '20% OFF',
    buttonText: 'Explore Menu',
    backgroundColor: '#142018',
    accentColor: '#10B981',
    imageUrl:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 2,
  },
  {
    title: 'Weekend Royal Dessert Feast',
    subtitle: 'Warm Gulab Jamun, Zafrani Kheer & Shahi Halwa',
    tag: 'SWEET TREAT',
    discount: '15% OFF',
    buttonText: 'Satisfy Craving',
    backgroundColor: '#201625',
    accentColor: '#8B5CF6',
    imageUrl:
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 3,
  },
  {
    title: 'Flame Grilled BBQ Platter',
    subtitle: 'Smoky chicken tikka, seekh kababs & malai boti straight off the grill',
    tag: 'BBQ NIGHT',
    discount: '25% OFF',
    buttonText: 'Fire It Up',
    backgroundColor: '#1C110A',
    accentColor: '#F97316',
    imageUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 4,
  },
  {
    title: 'Royal Chicken Karahi & Handi',
    subtitle: 'Butter-rich desi karahi served with fresh tandoori roghni naans',
    tag: 'DESI SPECIAL',
    discount: '20% OFF',
    buttonText: 'Order Now',
    backgroundColor: '#171A12',
    accentColor: '#EAB308',
    imageUrl:
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
    isActive: true,
    order: 5,
  },
];

export const INITIAL_DEALS = [
  {
    dealTitle: 'Duo Biryani & Roll Delight',
    tagline: '2x Chicken Dum Biryani + 2x Chicken Paratha Rolls + Drinks',
    description: 'Perfect for two! Includes 2 full plates of fragrant Chicken Dum Biryani, 2 crispy chicken garlic mayo paratha rolls, and 2 chilled soft drinks.',
    itemsIncluded: [
      '2x Chicken Dum Biryani (Full)',
      '2x Chicken Garlic Mayo Rolls',
      '2x Chilled Soft Drinks (345ml)',
      'Fresh Mint Raita & Salad',
    ],
    originalPrice: 1450,
    dealPrice: 999,
    discountPercentage: '31% OFF',
    savedAmount: 451,
    rating: 4.9,
    reviewsCount: 240,
    prepTime: '20-25 mins',
    serves: '2 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
    badge: 'POPULAR DUO',
    isBestseller: true,
    isWeeklyDeal: true,
    type: 'combo',
    order: 0,
    isActive: true,
  },
  {
    dealTitle: 'Double Burger & Wings Blast',
    tagline: '2x Double Cheese Burgers + Loaded Peri Fries + 4x Wings',
    description: 'Juicy double grilled chicken/beef patties with melted cheddar cheese, caramelized onions, hot peri-peri loaded fries, and 4 crispy wings.',
    itemsIncluded: [
      '2x Double Cheese Smash Burgers',
      'Loaded Peri Peri Seasoned Fries',
      '4x Crispy Hot Wings',
      '2x Chilled Soft Drinks (345ml)',
    ],
    originalPrice: 1350,
    dealPrice: 899,
    discountPercentage: '33% OFF',
    savedAmount: 451,
    rating: 4.8,
    reviewsCount: 195,
    prepTime: '15-20 mins',
    serves: '2 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    badge: 'TOP RATED',
    isBestseller: true,
    isWeeklyDeal: true,
    type: 'combo',
    order: 1,
    isActive: true,
  },
  {
    dealTitle: 'Royal Chicken Karahi Feast',
    tagline: 'Chicken Karahi Half + 4 Roghni Naans + Raita + Gulab Jamun',
    description: 'Traditional Desi handi-cooked chicken karahi made in pure butter and green chillies, served hot with freshly baked tandoori roghni naans.',
    itemsIncluded: [
      'Chicken White or Red Karahi (Half)',
      '4x Fresh Roghni Tandoori Naans',
      'Zeera Raita & Onion Salad',
      'Special Gulab Jamun (4 pcs)',
    ],
    originalPrice: 1750,
    dealPrice: 1199,
    discountPercentage: '31% OFF',
    savedAmount: 551,
    rating: 4.9,
    reviewsCount: 310,
    prepTime: '25-30 mins',
    serves: '3-4 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
    badge: 'CHEF SPECIAL',
    isWeeklyDeal: true,
    type: 'family',
    order: 2,
    isActive: true,
  },
  {
    dealTitle: 'Student Budget Meal Deal',
    tagline: 'Chicken Chowmein + 4x Fried Wontons + Drink',
    description: 'Delicious hot wok-tossed chicken egg noodles loaded with fresh crunchy veggies, accompanied by crispy golden wontons with sweet chili dip.',
    itemsIncluded: [
      'Chicken Vegetable Chowmein (Box)',
      '4x Crispy Chicken Wontons',
      'Sweet Chili Dip Sauce',
      'Chilled Soft Drink (345ml)',
    ],
    originalPrice: 850,
    dealPrice: 599,
    discountPercentage: '30% OFF',
    savedAmount: 251,
    rating: 4.7,
    reviewsCount: 165,
    prepTime: '12-15 mins',
    serves: '1 Person',
    imageUrl:
      'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=800&q=80',
    badge: 'BUDGET SAVER',
    isWeeklyDeal: false,
    type: 'budget',
    order: 3,
    isActive: true,
  },
  {
    dealTitle: 'Grand Dawat Box (Family Feast)',
    tagline: '1kg Mutton Biryani + 1kg Chicken Karahi + 8 Naans + Kheer',
    description: 'Complete home party package! Slow-cooked aromatic degi mutton biryani, 1kg chicken karahi, 8 hot naans, large matka kheer and 1.5L cold drink.',
    itemsIncluded: [
      '1kg Degi Mutton Dum Biryani',
      '1kg Desi Chicken Karahi',
      '8x Butter Roghni Naans',
      'Large Traditional Matka Kheer',
      '1.5 Litre Soft Drink Beverage',
      'Full Salad & Zeera Raita Platter',
    ],
    originalPrice: 4800,
    dealPrice: 3499,
    discountPercentage: '27% OFF',
    savedAmount: 1301,
    rating: 5.0,
    reviewsCount: 420,
    prepTime: '35-40 mins',
    serves: '6-8 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
    badge: 'GRAND DAWAT',
    isBestseller: true,
    isWeeklyDeal: true,
    type: 'family',
    order: 4,
    isActive: true,
  },
  {
    dealTitle: 'Charcoal BBQ Platter Deal',
    tagline: 'Malai Boti (8 pcs) + Beef Seekh Kabab (4 pcs) + 3 Parathas',
    description: 'Tender chicken malai boti skewers marinated in rich cream and spices, juicy beef seekh kababs grilled over hot charcoal, with golden lachha parathas.',
    itemsIncluded: [
      'Chicken Malai Boti (8 pcs)',
      'Beef Seekh Kababs (4 pcs)',
      '3x Crispy Puri Parathas',
      'Special Mint & Imli Chutney',
      'Chilled Soft Drink (1 Litre)',
    ],
    originalPrice: 1899,
    dealPrice: 1349,
    discountPercentage: '29% OFF',
    savedAmount: 550,
    rating: 4.9,
    reviewsCount: 280,
    prepTime: '20-25 mins',
    serves: '2-3 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=800&q=80',
    badge: 'SMOKY BBQ',
    isBestseller: true,
    isWeeklyDeal: true,
    type: 'bbq',
    order: 5,
    isActive: true,
  },
  {
    dealTitle: 'Crispy Zinger & Chicken Box',
    tagline: 'Mega Crunchy Zinger + 2x Fried Chicken + Fries + Drink',
    description: 'Golden crunchy batter-fried crispy zinger burger loaded with iceberg lettuce and secret sauce, plus 2 pieces of fried chicken and seasoned french fries.',
    itemsIncluded: [
      '1x Mega Crunchy Zinger Burger',
      '2x Crispy Fried Chicken Pieces',
      'Regular French Fries',
      'Garlic Mayo & Chili Garlic Dip',
      'Chilled Soft Drink (345ml)',
    ],
    originalPrice: 1050,
    dealPrice: 749,
    discountPercentage: '29% OFF',
    savedAmount: 301,
    rating: 4.8,
    reviewsCount: 215,
    prepTime: '15-18 mins',
    serves: '1-2 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?auto=format&fit=crop&w=800&q=80',
    badge: 'CRUNCH SPECIAL',
    isWeeklyDeal: true,
    type: 'combo',
    order: 6,
    isActive: true,
  },
  {
    dealTitle: 'Artisan Pizza & Cheesy Bread Deal',
    tagline: '12" Large Fajita Pizza + Cheesy Garlic Bread + Dip',
    description: 'Handcrafted artisan pizza topped with spicy fajita chicken chunks, bell peppers, olives, and 100% pure mozzarella cheese with cheesy garlic bread.',
    itemsIncluded: [
      '12" Large Fajita Pizza',
      'Cheesy Garlic Breadsticks (4 pcs)',
      'Special Ranch Dipping Sauce',
      'Chilled Soft Drink (1 Litre)',
    ],
    originalPrice: 1950,
    dealPrice: 1399,
    discountPercentage: '28% OFF',
    savedAmount: 551,
    rating: 4.8,
    reviewsCount: 190,
    prepTime: '20-25 mins',
    serves: '3-4 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    badge: 'PIZZA COMBO',
    isWeeklyDeal: true,
    type: 'special',
    order: 7,
    isActive: true,
  },
  {
    dealTitle: 'Mega Freezer Snack Box (36 Pcs)',
    tagline: '12 Shami Kababs + 12 Samosas + 12 Spring Rolls',
    description: 'Stock your freezer with 36 handmade crispy snacks! 100% pure chicken, homemade spice blend, zero preservatives, ready to fry in 4 minutes.',
    itemsIncluded: [
      '12x Chicken Shami Kababs',
      '12x Crispy Chicken Samosas',
      '12x Vegetable Chicken Spring Rolls',
      'Freezer-grade Ziplock Storage Bags',
    ],
    originalPrice: 2200,
    dealPrice: 1650,
    discountPercentage: '25% OFF',
    savedAmount: 550,
    rating: 4.9,
    reviewsCount: 310,
    prepTime: 'Ready to Fry',
    serves: 'Stock for 36 Pcs',
    imageUrl:
      'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=800&q=80',
    badge: 'FREEZER STOCK',
    isWeeklyDeal: false,
    type: 'frozen',
    order: 8,
    isActive: true,
  },
  {
    dealTitle: 'Desi Halwa Puri Breakfast Deal',
    tagline: '4x Fluffy Puris + Spicy Channay + Shahi Halwa + Achar',
    description: 'Fresh and hot weekend breakfast experience at home! Crisp fluffy puris paired with Lahore-style spicy channay, sweet semolina halwa, and spicy mixed pickle.',
    itemsIncluded: [
      '4x Fresh Fluffy Fried Puris',
      'Lahori Spicy Channay Tarkari',
      'Suji Halwa with Almonds & Raisins',
      'Desi Mixed Mango & Chili Achar',
    ],
    originalPrice: 680,
    dealPrice: 480,
    discountPercentage: '29% OFF',
    savedAmount: 200,
    rating: 4.9,
    reviewsCount: 175,
    prepTime: '15-20 mins',
    serves: '1-2 Persons',
    imageUrl:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80',
    badge: 'BREAKFAST HIT',
    isWeeklyDeal: false,
    type: 'budget',
    order: 9,
    isActive: true,
  },
];

const INITIAL_FOOD_ITEMS = [
  {
    name: 'Royal Chicken Dum Biryani',
    categoryName: 'Biryani & Rice',
    description: 'Fragrant basmati rice layered with saffron, spices, and tender chicken.',
    price: 640,
    originalPrice: 820,
    tag: 'Chef Special',
    tagColor: '#F97316',
    imageUrl:
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
    prepTime: '20 mins',
    rating: 4.9,
    isPopular: true,
    isActive: true,
    order: 0,
    servingOptions: [
      { id: 'regular', persons: 'For 2 Persons', portionLabel: 'Regular Serving', price: 640 },
      { id: 'family', persons: 'For 4 Persons', portionLabel: 'Family Pack', price: 1180 },
    ],
  },
  {
    name: 'Crispy Zinger Burger',
    categoryName: 'Burgers & Wraps',
    description: 'Crunchy chicken fillet with lettuce, cheese, and house sauce.',
    price: 420,
    originalPrice: 560,
    tag: 'Bestseller',
    tagColor: '#EF4444',
    imageUrl:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
    prepTime: '15 mins',
    rating: 4.8,
    isPopular: true,
    isActive: true,
    order: 1,
    servingOptions: [
      { id: 'single', persons: 'Single', portionLabel: 'Classic Burger', price: 420 },
      { id: 'combo', persons: 'Combo', portionLabel: 'Burger + Fries + Drink', price: 680 },
    ],
  },
  {
    name: 'Fajita Chicken Pizza',
    categoryName: 'Pizza & Pasta',
    description: 'Thin crust pizza with fajita chicken, peppers, olives, and mozzarella.',
    price: 1190,
    originalPrice: 1450,
    tag: 'Hot Pick',
    tagColor: '#10B981',
    imageUrl:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    prepTime: '25 mins',
    rating: 4.8,
    isPopular: true,
    isActive: true,
    order: 2,
    servingOptions: [
      { id: 'small', persons: 'For 2 Persons', portionLabel: '12 inch', price: 1190 },
      { id: 'large', persons: 'For 4 Persons', portionLabel: 'Large Family', price: 1790 },
    ],
  },
  {
    name: 'BBQ Chicken Platter',
    categoryName: 'BBQ & Grills',
    description: 'Smoky grilled chicken, tikka bites, and house-made sauces.',
    price: 1490,
    originalPrice: 1890,
    tag: 'Grill Night',
    tagColor: '#F59E0B',
    imageUrl:
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80',
    prepTime: '20 mins',
    rating: 4.9,
    isPopular: true,
    isActive: true,
    order: 3,
    servingOptions: [
      { id: 'regular', persons: 'For 2 Persons', portionLabel: 'Regular Platter', price: 1490 },
      { id: 'party', persons: 'For 4 Persons', portionLabel: 'Party Platter', price: 2590 },
    ],
  },
  {
    name: 'Karahi Chicken Handi',
    categoryName: 'Karahi & Handi',
    description: 'Traditional handi-cooked chicken with green chilies, ginger, and butter.',
    price: 980,
    originalPrice: 1260,
    tag: 'Desi Favorite',
    tagColor: '#8B5CF6',
    imageUrl:
      'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80',
    prepTime: '30 mins',
    rating: 4.9,
    isPopular: true,
    isActive: true,
    order: 4,
    servingOptions: [
      { id: 'half', persons: 'Half', portionLabel: 'Half Karahi', price: 980 },
      { id: 'full', persons: 'Full', portionLabel: 'Full Karahi', price: 1760 },
    ],
  },
  {
    name: 'Gulab Jamun Sundae',
    categoryName: 'Desserts & Sweets',
    description: 'Warm gulab jamun with vanilla ice cream and pistachio crunch.',
    price: 360,
    originalPrice: 480,
    tag: 'Sweet End',
    tagColor: '#EC4899',
    imageUrl:
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
    prepTime: '10 mins',
    rating: 4.7,
    isPopular: true,
    isActive: true,
    order: 5,
    servingOptions: [
      { id: 'single', persons: 'Single', portionLabel: 'Regular Bowl', price: 360 },
      { id: 'sharing', persons: 'Sharing', portionLabel: 'Family Sundae', price: 620 },
    ],
  },
];

export const INITIAL_VOUCHERS = [
  {
    code: 'WELCOME100',
    discountType: 'fixed',
    discountValue: 100,
    minOrder: 600,
    expiryDate: '31 Dec 2026',
    isActive: true,
  },
  {
    code: 'FEAST20',
    discountType: 'percentage',
    discountValue: 20,
    minOrder: 1500,
    expiryDate: '30 Jun 2027',
    isActive: true,
  },
  {
    code: 'FREEDELIVERY',
    discountType: 'fixed',
    discountValue: 150,
    minOrder: 400,
    expiryDate: '31 Mar 2027',
    isActive: true,
  },
];

export const seedDatabaseIfEmpty = async () => {
  try {
    const categoryCount = await Category.countDocuments();
    if (categoryCount === 0) {
      await Category.insertMany(INITIAL_CATEGORIES);
      console.log(`✅ Seeded ${INITIAL_CATEGORIES.length} default categories into MongoDB`);
    }

    const bannerCount = await Banner.countDocuments();
    if (bannerCount === 0) {
      await Banner.insertMany(INITIAL_BANNERS);
      console.log(`✅ Seeded ${INITIAL_BANNERS.length} default banners into MongoDB`);
    }

    const dealCount = await Deal.countDocuments();
    if (dealCount === 0) {
      await Deal.insertMany(INITIAL_DEALS);
      console.log(`✅ Seeded ${INITIAL_DEALS.length} default deals into MongoDB`);
    }

    const foodItemCount = await FoodItem.countDocuments();
    if (foodItemCount === 0) {
      const categoryMap = new Map((await Category.find({}).lean()).map((category) => [category.name, category._id]));
      const foodItemsToSeed = INITIAL_FOOD_ITEMS.map((item) => ({
        ...item,
        categoryId: categoryMap.get(item.categoryName),
      })).filter((item) => item.categoryId);

      if (foodItemsToSeed.length > 0) {
        await FoodItem.insertMany(foodItemsToSeed);
        console.log(`✅ Seeded ${foodItemsToSeed.length} default food items into MongoDB`);
      }
    }

    const voucherCount = await Voucher.countDocuments();
    if (voucherCount === 0) {
      await Voucher.insertMany(INITIAL_VOUCHERS);
      console.log(`✅ Seeded ${INITIAL_VOUCHERS.length} default vouchers into MongoDB`);
    }

    const blogCount = await Blog.countDocuments();
    if (blogCount === 0) {
      const INITIAL_BLOGS = [
        {
          title: '#ORD-9842',
          customerName: 'Ayesha K.',
          destinationArea: 'Gulberg III, Lahore',
          itemsDescription: '2x Special Chicken Dum Biryani, 1x Mint Raita, 1x Fresh Salad & 2x Cans',
          category: 'Fresh Cooked',
          photoUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?q=80&w=800&auto=format&fit=crop',
          dispatchedAt: '12 mins ago (Today, 1:45 PM)',
          riderName: 'Rider Farhan (Bike #LEB-4921)',
          status: 'Out for Delivery',
          sealVerified: true,
          likes: 42,
          isPublished: true,
        },
        {
          title: '#ORD-9839',
          customerName: 'Zubair Ahmed',
          destinationArea: 'DHA Phase 5',
          itemsDescription: '2 Dozens Frozen Beef Shami Kababs & 1 Pack Vegetable Spring Rolls (12 Pcs)',
          category: 'Frozen Packs',
          photoUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?q=80&w=800&auto=format&fit=crop',
          dispatchedAt: '35 mins ago (Today, 1:20 PM)',
          riderName: 'Rider Bilal (Insulated Bag #4)',
          status: 'Delivered',
          sealVerified: true,
          likes: 29,
          isPublished: true,
        },
        {
          title: '#ORD-9835',
          customerName: 'Dr. Saima Malik',
          destinationArea: 'Model Town Block C',
          itemsDescription: 'Tarkey Wali Daal Chawal Thali with 2x Shami Kababs & Achar Jar',
          category: 'Fresh Cooked',
          photoUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop',
          dispatchedAt: '1 hour ago (Today, 12:55 PM)',
          riderName: 'Rider Asad (Bike #LEG-1182)',
          status: 'Delivered',
          sealVerified: true,
          likes: 36,
          isPublished: true,
        },
      ];
      await Blog.insertMany(INITIAL_BLOGS);
      console.log(`✅ Seeded ${INITIAL_BLOGS.length} default blogs/dispatches into MongoDB`);
    }

    // Seed the first admin only when explicitly configured through environment variables.
    // Credentials must never be hard-coded: a well-known default password is a backdoor.
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
      const adminPassword = process.env.ADMIN_PASSWORD || '';

      if (!adminEmail || !adminPassword) {
        console.warn(
          '⚠️  No admin account exists and ADMIN_EMAIL/ADMIN_PASSWORD are not configured — skipping admin seeding.'
        );
      } else {
        await User.create({
          name: (process.env.ADMIN_NAME || 'Kitchen Admin').trim(),
          email: adminEmail.toLowerCase(),
          phone: (process.env.ADMIN_PHONE || '03000000000').trim(),
          password: adminPassword,
          role: 'admin',
          city: (process.env.ADMIN_CITY || 'Lahore').trim(),
          address: 'Food Kitchen HQ',
          membershipTier: 'Platinum',
          avatar: 'https://ui-avatars.com/api/?name=Kitchen+Admin&background=FF7A00&color=fff&size=200',
        });
        console.log(`✅ Admin user seeded for ${adminEmail} (password taken from ADMIN_PASSWORD).`);
      }
    }

    // Keep the storefront ranking fields (avgRating / soldCount / bestseller and
    // top-rated flags) in sync with the stored orders and reviews. This also
    // backfills a database that was created before those fields existed.
    const { updated } = await recomputeCatalogStats();
    console.log(`✅ Recomputed ranking fields for ${updated} food items`);
  } catch (error) {
    console.error('Error during database auto-seeding:', error.message);
  }
};
