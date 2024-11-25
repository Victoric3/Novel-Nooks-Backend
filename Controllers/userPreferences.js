const express = require('express');
const asyncErrorWrapper = require('express-async-handler');
const User = require("../Models/user");
const CustomError = require('../Helpers/error/CustomError');

// Update user photo endpoint
const updatePhoto = asyncErrorWrapper(async (req, res, next) => {
    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    // Check if file was uploaded
    if (!req.file) {
        return next(new CustomError('Please provide an image file', 400));
    }

    // Update user photo with the new file path/url
    user.photo = req.file.path; // or however your file upload system provides the URL

    await user.save();

    res.status(200).json({
        success: true,
        message: 'Photo updated successfully',
        data: {
            photo: user.photo
        }
    });
});

// Update user interests endpoint
const updateInterests = asyncErrorWrapper(async (req, res, next) => {
    const { interests } = req.body;

    if (!interests || !Array.isArray(interests)) {
        return next(new CustomError('Please provide an array of interests', 400));
    }

    // Validate interests against enum values in schema
    const validInterests = [
        "Romance",
        "shortStory",
        "sci-Fi",
        "Fantasy",
        "Horror",
        "Mystery",
        "Non-Fiction",
        "Historical Fiction",
        "Multi-genre",
        "Adventure",
        "Biography",
        "Science",
        "Self-Help",
        "Personal-development"
    ];

    // Check if all provided interests are valid
    const invalidInterests = interests.filter(interest => !validInterests.includes(interest));
    if (invalidInterests.length > 0) {
        return next(new CustomError(`Invalid interests: ${invalidInterests.join(', ')}`, 400));
    }

    const user = await User.findById(req.user.id);

    if (!user) {
        return next(new CustomError('User not found', 404));
    }

    // Update interests
    user.interests = interests;

    await user.save();

    res.status(200).json({
        success: true,
        message: 'Interests updated successfully',
        data: {
            interests: user.interests
        }
    });
});

module.exports = { updatePhoto, updateInterests };