const mongoose = require("mongoose");

connectDatabase = async () => {
  await mongoose.connect(
    `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.lyio3vv.mongodb.net/?appName=Cluster0`,
    {
      useNewUrlParser: true,
      // serverSelectionTimeoutMS: 5000, // Timeout after 5s
      // connectTimeoutMS: 10000, // Give up initial connection after 10s
    },
  );
  console.log("MongoDB Connection Successfully");
};

module.exports = connectDatabase;
