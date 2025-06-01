const asyncErrorWrapper = require("express-async-handler");
const Story = require("../Models/story");
const mongoose = require("mongoose");

/**
 * Add a book to featured list
 * @param {Object} req - Request object with ebookId in body
 * @param {Object} res - Response object
 */
const addFeaturedBook = asyncErrorWrapper(async (req, res) => {
  try {
    const { ebookId } = req.body;
    console.log("Adding featured book with ID:", ebookId);
    if (!ebookId) {
      return res.status(400).json({
        success: false,
        message: "ebookId is required"
      });
    }

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(ebookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ebook ID format"
      });
    }

    // Find and update the story
    const updatedStory = await Story.findByIdAndUpdate(
      ebookId,
      { isFeatured: true },
      { new: true, select: 'title slug isFeatured' }
    );
    console.log("Updated story:", updatedStory);
    
    if (!updatedStory) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }
    console.log("supposeed to respond");

    return res.status(200).json({
      success: true,
      message: "Book added to featured list successfully",
      data: {
        id: updatedStory._id,
        title: updatedStory.title,
        slug: updatedStory.slug,
        isFeatured: updatedStory.isFeatured
      }
    });
  } catch (error) {
    console.error("Error in addFeaturedBook:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

/**
 * Remove a book from featured list
 * @param {Object} req - Request object with ebookId in body
 * @param {Object} res - Response object
 */
const removeFeaturedBook = asyncErrorWrapper(async (req, res) => {
  try {
    const { ebookId } = req.body;

    if (!ebookId) {
      return res.status(400).json({
        success: false,
        message: "ebookId is required"
      });
    }

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(ebookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ebook ID format"
      });
    }

    // Find and update the story
    const updatedStory = await Story.findByIdAndUpdate(
      ebookId,
      { isFeatured: false },
      { new: true, select: 'title slug isFeatured' }
    );

    if (!updatedStory) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Book removed from featured list successfully",
      data: {
        id: updatedStory._id,
        title: updatedStory.title,
        slug: updatedStory.slug,
        isFeatured: updatedStory.isFeatured
      }
    });
  } catch (error) {
    console.error("Error in removeFeaturedBook:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

/**
 * List all featured books
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const listFeaturedBooks = asyncErrorWrapper(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * pageSize;

    // Find featured stories with pagination
    const featuredStories = await Story.find({ isFeatured: true })
      .select('_id title slug image author createdAt')
      .populate('author', 'username photo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize);

    // Count total featured stories
    const totalCount = await Story.countDocuments({ isFeatured: true });

    return res.status(200).json({
      success: true,
      count: featuredStories.length,
      data: featuredStories,
      page: page,
      pages: Math.ceil(totalCount / pageSize),
      total: totalCount
    });
  } catch (error) {
    console.error("Error in listFeaturedBooks:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

/**
 * Get a random featured book
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
const getRandomFeaturedBook = asyncErrorWrapper(async (req, res) => {
  try {
    const userId = req.user?._id;

    // Count total featured books
    const featuredCount = await Story.countDocuments({ isFeatured: true });
    
    if (featuredCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No featured books found"
      });
    }
    
    // Generate a random index to select a random featured book
    const randomIndex = Math.floor(Math.random() * featuredCount);
    
    // Build pipeline to get a random featured book with consistent fields
    const pipeline = [
      { $match: { isFeatured: true } },
      { $skip: randomIndex },
      { $limit: 1 },
      // Add calculated fields
      {
        $addFields: {
          likeCount: {
            $cond: {
              if: { $isArray: "$likes" },
              then: { $size: "$likes" },
              else: 0,
            },
          },
          contentCount: {
            $cond: {
              if: { $isArray: "$content" },
              then: { $size: "$content" },
              else: 0,
            },
          },
        },
      },
      // Join with users collection for author info
      {
        $lookup: {
          from: "users",
          let: { authorId: "$author" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$authorId"] } } },
            { $project: { username: 1, photo: 1 } },
          ],
          as: "authorInfo",
        },
      },
      { $unwind: "$authorInfo" },
      // Add like status and reading list status if user is authenticated
      ...(userId
        ? [
          {
            $lookup: {
              from: "users",
              let: { storyId: { $toString: "$_id" } },
              pipeline: [
                { $match: { _id: userId } },
                {
                  $project: {
                    _id: 0,
                    hasLiked: {
                      $cond: {
                        if: { $isArray: "$likes" },
                        then: {
                          $in: [
                            "$$storyId",
                            { $map: { input: "$likes", as: "id", in: { $toString: "$$id" } } }
                          ]
                        },
                        else: false
                      }
                    },
                    isInReadingList: {
                      $cond: {
                        if: { $isArray: "$readList" },
                        then: {
                          $in: [
                            "$$storyId",
                            { $map: { input: "$readList", as: "id", in: { $toString: "$$id" } } }
                          ]
                        },
                        else: false
                      }
                    }
                  }
                }
              ],
              as: "userInteraction"
            }
          },
          {
            $addFields: {
              userInteraction: {
                $cond: {
                  if: { $gt: [{ $size: "$userInteraction" }, 0] },
                  then: { $arrayElemAt: ["$userInteraction", 0] },
                  else: { hasLiked: false, isInReadingList: false }
                }
              }
            }
          },
          {
            $addFields: {
              likeStatus: { $ifNull: ["$userInteraction.hasLiked", false] },
              isInReadingList: { $ifNull: ["$userInteraction.isInReadingList", false] }
            }
          },
          {
            $project: { userInteraction: 0 }
          }
        ]
        : [
          {
            $addFields: {
              likeStatus: false,
              isInReadingList: false
            }
          }
        ]),
      // Format the output fields
      {
        $project: {
          _id: 1,
          title: 1,
          slug: 1,
          summary: 1,
          tags: 1,
          labels: 1,
          image: 1,
          readTime: 1,
          free: 1,
          prizePerChapter: 1,
          createdAt: 1,
          updatedAt: 1,
          author: {
            _id: "$author",
            username: "$authorInfo.username",
            photo: "$authorInfo.photo"
          },
          likeCount: 1,
          commentCount: 1,
          averageRating: 1,
          ratingCount: 1,
          contentCount: 1,
          likeStatus: 1,
          isInReadingList: 1,
          contentTitles: 1,
          completed: 1,
          isFeatured: 1,
          ratings: {
            $cond: {
              if: { $isArray: "$ratings" },
              then: "$ratings",
              else: []
            }
          }
        },
      },
    ];

    // Execute the aggregation
    const featuredBooks = await Story.aggregate(pipeline);
    
    if (!featuredBooks || featuredBooks.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No featured books found"
      });
    }

    return res.status(200).json({
      success: true,
      data: featuredBooks[0]
    });
  } catch (error) {
    console.error("Error in getRandomFeaturedBook:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
});

module.exports = {
  addFeaturedBook,
  removeFeaturedBook,
  listFeaturedBooks,
  getRandomFeaturedBook
};