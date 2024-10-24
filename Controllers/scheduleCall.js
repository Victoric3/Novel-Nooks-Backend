const Email = require("../Helpers/Libraries/email");
const User = require("../Models/user");

const scheduleCall = async (req, res) => {
  const { email, message, date, budget, service, name } = req.body;

  try {
    const users = await User.find({ role: "admin" });
    users.forEach((user) => {
      new Email(user, {
        email,
        message,
        date,
        budget,
        service,
        name,
      }).sendScheduleEmail();
    });
    res.status(200).json({
      status: "success",
      message: "Call scheduled and admins notified.",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      errorMessage: "An error occurred while scheduling the call.",
    });
  }
};

module.exports = { scheduleCall };
