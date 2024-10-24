const User = require('../Models/user');



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
        const {adminPass, vouchers, increase} = req.body;
        
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


module.exports = { updateVouchers, updateVouchersCore }