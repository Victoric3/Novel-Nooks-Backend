const asyncErrorWrapper = require("express-async-handler")
const User = require("../Models/user");
const Story = require("../Models/story");
const CustomError = require("../Helpers/error/CustomError");
const { comparePassword, validateUserInput } = require("../Helpers/input/inputHelpers");

const profile = asyncErrorWrapper(async (req, res, next) => {

  return res.status(200).json({
    success: true,
    data: req.user
  })

})


const editProfile = asyncErrorWrapper(async (req, res, next) => {

  const { email, username } = req.body

  try {

    const user = await User.findByIdAndUpdate(req.user.id, {
      email, username,
      photo: req.fileLink
    },
      {
        new: true,
        runValidators: true
      })

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully'

    })
  } catch (e) {
    return res.status(500).json({
      status: 'fail',
      errorMessage: 'internal server error'
    })
  }

})


const changePassword = asyncErrorWrapper(async (req, res, next) => {

  const { newPassword, oldPassword } = req.body

  if (!validateUserInput(newPassword, oldPassword)) {

    return next(new CustomError("Please check your inputs ", 400))

  }

  const user = await User.findById(req.user.id).select("+password")

  if (!comparePassword(oldPassword, user.password)) {
    return next(new CustomError('Old password is incorrect ', 400))
  }

  user.password = newPassword

  await user.save();


  return res.status(200).json({
    success: true,
    message: "Change Password  Successfully",
    user: user

  })

})

const addStoryToReadList = async (req, res, next) => {
  try {
    const { ebookId } = req.params; // Use ebookId instead of slug

    // Get authenticated user directly from req.user
    const userId = req.user._id;

    // Find story by ID instead of slug
    const story = await Story.findById(ebookId);
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }

    // Get user with readList data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Initialize readList if it doesn't exist
    if (!user.readList) {
      user.readList = [];
    }

    // Toggle story in readList (add if not present, remove if present)
    const storyIdStr = story._id.toString();
    const storyIndex = user.readList.findIndex(id => id.toString() === storyIdStr);

    if (storyIndex === -1) {
      // Story not in readList - add it
      user.readList.push(story._id);
    } else {
      // Story already in readList - remove it
      user.readList.splice(storyIndex, 1);
    }

    // Update readListLength
    user.readListLength = user.readList.length;
    await user.save();

    // Check final state to return in response
    const isInReadList = user.readList.some(id => id.toString() === storyIdStr);

    return res.status(200).json({
      success: true,
      message: isInReadList ? 'Added to reading list' : 'Removed from reading list',
      status: isInReadList
    });
  } catch (error) {
    console.error('Error in addStoryToReadList:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to update reading list",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const readListPage = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const searchQuery = req.query.search || "";
    const userId = req.user.id;

    // Get user with readList
    const user = await User.findById(userId).select('readList readListLength likes').lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.readList || user.readList.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0
        }
      });
    }

    // Create query for finding stories in the reading list
    const query = {
      _id: { $in: user.readList }
    };

    // Add search criteria if provided
    if (searchQuery) {
      query.$or = [
        { title: { $regex: new RegExp(searchQuery, 'i') } },
        { summary: { $regex: new RegExp(searchQuery, 'i') } }
      ];
    }

    // Count total matching documents (for pagination)
    const totalItems = await Story.countDocuments(query);
    const totalPages = Math.ceil(totalItems / pageSize);

    // Get paginated results
    const readListItems = await Story.find(query)
      .select('-content -contentTitles')
      .skip(skip)
      .limit(pageSize)
      .lean();

    // Sort items to match the order in readList
    const sortedReadList = readListItems.map(story => {
      // Get the index in readList for sorting
      const indexInReadList = user.readList.findIndex(id => id.toString() === story._id.toString());

      // Add likeStatus field (check if in user.likes)
      const likeStatus = user.likes ? user.likes.some(id => id.toString() === story._id.toString()) : false;

      // Add isInReadingList (always true in this context)
      const isInReadingList = true;

      // Ensure ratings is an array
      const ratings = Array.isArray(story.ratings) ? story.ratings : [];

      return {
        ...story,
        likeStatus,
        isInReadingList,
        ratings,
        _readListIndex: indexInReadList
      };
    })
      .sort((a, b) => a._readListIndex - b._readListIndex)
      .map(story => {
        // Remove the temporary sorting field
        const { _readListIndex, ...storyWithoutIndex } = story;
        return storyWithoutIndex;
      });

    return res.status(200).json({
      success: true,
      data: sortedReadList,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems
      }
    });
  } catch (error) {
    console.error("Error in readListPage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reading list",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const checkStoryInReadList = async (req, res) => {
  try {
    const { ebookId } = req.params;  // Changed from storyId to ebookId
    const userId = req.user._id;

    // Find user with minimal projection (only select readList)
    const user = await User.findById(userId)
      .select('readList')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if story is in readList
    const isInReadList = user.readList && user.readList.some(
      id => id.toString() === ebookId.toString()  // Changed from storyId to ebookId
    );

    return res.status(200).json({
      success: true,
      isInReadList: isInReadList || false
    });
  } catch (error) {
    console.error("Error in checkStoryInReadList:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check reading list status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const getLikedStoriesPage = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    const searchQuery = req.query.search || "";
    const userId = req.user.id;

    // Get user with likes and readList
    const user = await User.findById(userId).select('likes readList').lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.likes || user.likes.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0
        }
      });
    }

    // Create query for finding liked stories
    const query = {
      _id: { $in: user.likes }
    };

    // Add search criteria if provided
    if (searchQuery) {
      query.$or = [
        { title: { $regex: new RegExp(searchQuery, 'i') } },
        { summary: { $regex: new RegExp(searchQuery, 'i') } }
      ];
    }

    // Count total matching documents (for pagination)
    const totalItems = await Story.countDocuments(query);
    const totalPages = Math.ceil(totalItems / pageSize);

    // Get paginated results
    const likedStories = await Story.find(query)
      .select('-content -contentTitles')
      .skip(skip)
      .limit(pageSize)
      .lean();

    // Process the results to add interaction fields
    const processedLikes = likedStories.map(story => {
      // Get the index in likes for sorting
      const indexInLikes = user.likes.findIndex(id => id.toString() === story._id.toString());

      // Add likeStatus (always true in this context)
      const likeStatus = true;

      // Add isInReadingList
      const isInReadingList = user.readList ?
        user.readList.some(id => id.toString() === story._id.toString()) :
        false;

      // Ensure ratings is an array
      const ratings = Array.isArray(story.ratings) ? story.ratings : [];

      return {
        ...story,
        likeStatus,
        isInReadingList,
        ratings,
        _likeIndex: indexInLikes // Temporary field for sorting
      };
    })
      .sort((a, b) => a._likeIndex - b._likeIndex)
      .map(story => {
        // Remove the temporary sorting field
        const { _likeIndex, ...storyWithoutIndex } = story;
        return storyWithoutIndex;
      });

    return res.status(200).json({
      success: true,
      data: processedLikes,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems
      }
    });
  } catch (error) {
    console.error("Error in getLikedStoriesPage:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch favorites",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  profile,
  editProfile,
  changePassword,
  addStoryToReadList,
  readListPage,
  checkStoryInReadList,
  getLikedStoriesPage
}
