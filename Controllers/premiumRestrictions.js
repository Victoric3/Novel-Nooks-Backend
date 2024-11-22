const User = require("../Models/user");

const updateVouchersCore = async (currUser, adminPass, vouchers, increase) => {
    try{

        if(adminPass !== process.env.ADMIN_PASS){
            throw Error("you are not allowed to do this");
        };
        
        const user = await User.findOne({_id: currUser._id});
        if(!user){
        throw Error("user does not exist");
    };

    if(increase){
        user.vouchers += vouchers
    }else{
        user.vouchers -= vouchers
    };

    await user.save()
    return;
    } catch(error){
        throw Error(error);
    }
};

const updateVouchers = async (req, res) => {
    try{
        const {vouchers, increase} = req.body;
        const adminPass = process.env.ADMIN_PASS
        
        await updateVouchersCore(req.user, adminPass, vouchers, increase)
        res.status(200).json({
            message: `${increase? "+" : "-"} ${vouchers}, you now have ${req.user.vouchers} left`
        })
    }catch(err){
        console.log(err)
        res.status(500).json({
            errorMessage: "internal server error"
        })
    }
}

const updateCoinsCore = async (currUser, adminPass, coins, increase) => {
    try{

        if(adminPass !== process.env.ADMIN_PASS){
            throw Error("you are not allowed to do this");
        };
        
        const user = await User.findOne({_id: currUser._id});
        if(!user){
        throw Error("user does not exist");
    };

    if(increase){
        user.coins += coins
    }else{
        user.coins -= coins
    };

    await user.save()
    return;
    } catch(error){
        throw Error(error);
    }
};

const updateCoins = async (req, res) => {
    try{
        const {coins, increase} = req.body;
        const adminPass = process.env.ADMIN_PASS;
        await updateCoinsCore(req.user, adminPass, coins, increase)
        res.status(200).json({
            message: `${increase? "+" : "-"} ${coins}, you now have ${req.user.coins} left`
        })
    }catch(err){
        console.log(err)
        res.status(500).json({
            errorMessage: "internal server error"
        })
    }
}


// Function to gift coins to an author
const giftToAuthor = async (req, res) => {
    try {
        const { authorId, coins } = req.body;
        const currUser = req.user;

        // Fetch the author user
        const author = await User.findOne({ _id: authorId });
        if (!author) {
            throw Error("Author does not exist");
        }

        // Check if the current user has enough coins
        if (currUser.coins < coins) {
            throw Error("Insufficient coins");
        }

        // Deduct coins from the current user
        currUser.coins -= coins;

        // Add coins to the author's balance
        author.coins += coins;

        // Save both users
        await currUser.save();
        await author.save();

        res.status(200).json({
            message: `Successfully gifted ${coins} coins to the author. You now have ${currUser.coins} coins left.`,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            errorMessage: err.message || "Internal server error",
        });
    }
};

// Function to convert coins to vouchers
const coinsToVouchers = async (req, res) => {
    try {
        const { coins } = req.body;
        const currUser = req.user;

        // Conversion rate (for example, 1 voucher = 10 coins)
        const conversionRate = 0.1;
        const vouchers = Math.floor(coins / conversionRate);

        // Check if the user has enough coins
        if (currUser.coins < coins) {
            throw Error("Insufficient coins");
        }

        // Deduct coins and add vouchers
        currUser.coins -= coins;
        currUser.vouchers += vouchers;

        // Save user data
        await currUser.save();

        res.status(200).json({
            message: `Successfully converted ${coins} coins into ${vouchers} vouchers. You now have ${currUser.coins} coins and ${currUser.vouchers} vouchers.`,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            errorMessage: err.message || "Internal server error",
        });
    }
};

module.exports = { 
    updateVouchers, 
    updateVouchersCore, 
    updateCoins, 
    updateCoinsCore, 
    giftToAuthor, 
    coinsToVouchers 
};