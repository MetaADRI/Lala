const sequelize = require('./config/database');
const User = require('./models/User');
const Listing = require('./models/Listing');
require('dotenv').config();

const seedData = async () => {
  try {
    await sequelize.sync({ force: true });
    console.log('Database cleared and synced for seeding...');

    // Create a mock Host
    const host = await User.create({
      phone: '0977000111',
      name: 'Bwalya Phiri',
      role: 'host',
      isVerified: true
    });

    // Create a default Admin
    const admin = await User.create({
      phone: '0977999999',
      name: 'Lala Admin',
      role: 'admin',
      isVerified: true
    });

    console.log('✓ Admin account created: 0977999999');

    // Create initial Listings
    await Listing.bulkCreate([
      {
        name: 'Sunrise Guesthouse',
        type: 'Guesthouse',
        city: 'Kitwe',
        district: 'Parklands',
        price: 180,
        photos: ['https://images.unsplash.com/photo-1566073771259-6a8506099945'],
        amenities: ['Wi-Fi', 'Parking', 'Hot Water', 'Security'],
        isApproved: true,
        hostId: host.id
      },
      {
        name: 'Copper Lodge',
        type: 'Lodge',
        city: 'Kitwe',
        district: 'Wusakile',
        price: 250,
        photos: ['https://images.unsplash.com/photo-1551882547-ff43c639f675'],
        amenities: ['Wi-Fi', 'Swimming Pool', 'Breakfast', 'Security'],
        isApproved: true,
        hostId: host.id
      },
      {
        name: 'City Rest House',
        type: 'Rest House',
        city: 'Kitwe',
        district: 'Town Centre',
        price: 120,
        photos: ['https://images.unsplash.com/photo-1520250497591-112f2f40a3f4'],
        amenities: ['Parking', 'Security'],
        isApproved: true,
        hostId: host.id
      },
      {
        name: 'Lusaka Central Hostel',
        type: 'Hostel',
        city: 'Lusaka',
        district: 'Central',
        price: 90,
        photos: ['https://images.unsplash.com/photo-1555854877-bab0e564b8d5'],
        amenities: ['Wi-Fi', 'Lounge'],
        isApproved: true,
        hostId: host.id
      },
      {
        name: 'Victoria Falls View Lodge',
        type: 'Lodge',
        city: 'Livingstone',
        district: 'Mosi-oa-Tunya',
        price: 450,
        photos: ['https://images.unsplash.com/photo-1542314831-068cd1dbfeeb'],
        amenities: ['Wi-Fi', 'AC', 'Pool', 'Tour Guide'],
        isApproved: true,
        hostId: host.id
      }
    ]);

    console.log('Seeding complete! Initial Zambian properties added.');
    process.exit();
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
