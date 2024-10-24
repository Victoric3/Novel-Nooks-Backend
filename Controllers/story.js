const asyncErrorWrapper = require("express-async-handler");
const Comment = require("../Models/comment");
const Story = require("../Models/story");
const User = require("../Models/user");
const deleteImageFile = require("../Helpers/Libraries/deleteImageFile");
const {
  searchHelper,
  paginateHelper,
} = require("../Helpers/query/queryHelpers");

const calculateReadTime = (chapter) => {
  const wordCount = chapter?.trim().split(/\s+/).length;
  return Math.floor(wordCount / 200); // Assuming average reading speed of 200 words/min
};

const addStory = async (req, res, next) => {
  const { title, content, summary, tags, prizePerChapter, free } = req.body;

  //only admins are allowed to create stories
  if (req.user.role !== "admin") {
    return res.status(401).json({
      status: "unAuthorized",
      errorMessage: "you need to have admin access to do this",
    });
  }

  // Ensure content is an array of chapters (strings)
  if (!Array.isArray(content)) {
    return res.status(400).json({
      success: false,
      message: "Content must be an array of chapters",
    });
  }

  // Calculate readtime based on word count
  let readtime = content.map((chapter) => calculateReadTime(chapter));

  try {
    // Access req.fileLink, which was attached by the middleware
    const newStory = await Story.create({
      title,
      content,
      author: req.user._id,
      image: req.fileLink || "https://i.ibb.co/Jx8zhtr/story.jpg",
      readtime,
      tags,
      summary,
      prizePerChapter,
      free,
    });

    // Send a success response with the newStory data
    return res.status(200).json({
      success: true,
      message: "Add story successfully",
      data: newStory,
    });
  } catch (error) {
    console.log(error);
    // Handle errors
    next(error);
  }
};

const addImage = asyncErrorWrapper(async (req, res, next) => {
  try {
    if (!req.fileLink) {
      return res.status(400).json({
        success: false,
        errorMessage: "file could not be processed",
      });
    }
    res.status(200).json({
      success: true,
      message: "file uploaded successfully",
      url: req.fileLink,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      errorMessage: error || "internal server error",
    });
  }
});

const getAllStories = async (req, res, next) => {
  try {
    const { specific } = req.body; // true/false from the request body
    const { slug } = req.params;
    const searchQuery = req.query.search || ""; // Capture the search query from the request
    const page = parseInt(req.query.page) || 1; // Get the current page
    const pageSize = parseInt(req.query.limit) || 3; // Get the number of items per page
    const skip = (page - 1) * pageSize; // Calculate the number of items to skip for pagination

    // Build the base query
    let query = [
      {
        $addFields: {
          rankPoints: {
            $add: [
              { $multiply: ["$commentCount", 2] }, // 2 points per comment
              "$likeCount", // 1 point per like
              {
                $cond: [
                  { $gte: ["$averageRating", 3] }, // Positive rating adjustment
                  { $multiply: ["$averageRating", "$ratingCount", 10] }, // 10 points per rating
                  {
                    $multiply: [
                      { $subtract: [3, "$averageRating"] },
                      "$ratingCount",
                      -10,
                    ],
                  }, // Deduct points for below-average ratings
                ],
              },
            ],
          },
        },
      },
    ];

    // Handle search functionality
    if (searchQuery) {
      query.push({
        $match: {
          title: { $regex: new RegExp(searchQuery, "i") }, // Case-insensitive search
        },
      });
    }

    // Handle specific tag filtering
    if (specific && slug === "recent") {

      // Get the latest content if slug is 'recent'
      query.push({ $sort: { createdAt: -1 } });
    } else if (specific) {

      // Match stories with the specific tag
      query.push({ $match: { tags: slug } });
    } else {

      // If specific is false, add 1000 points for each matching tag
      if (slug) {
        const tagsArray = slug.split("+").filter((tag) => tag); // Split the slug into an array of tags, ensuring no empty strings
        query.push({
          $addFields: {
            rankPoints: {
              $add: [
                "$rankPoints", // Existing rankPoints
                {
                  $multiply: [
                    { $size: { $setIntersection: ["$tags", tagsArray] } },
                    1000,
                  ],
                }, // Add 1000 for each matching tag
                // Adjust the multiplier value as needed for ranking weight
              ],
            },
          },
        });
      }
    }
    // Sort stories by rankPoints
    query.push({ $sort: { rankPoints: -1 } });

    // Apply pagination
    query.push({ $skip: skip });
    query.push({ $limit: pageSize });

    // Execute the aggregation pipeline
    const stories = await Story.aggregate(query);
    console.log(query);

    return res.status(200).json({
      success: true,
      count: stories.length,
      data: stories,
      page: page,
      pages: Math.ceil(stories.length / pageSize),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const detailStory = asyncErrorWrapper(async (req, res) => {
  const { slug } = req.params;
  const { partial, chapter } = req.body;

  const user = await User.findOne({ _id: req.user._id });
  if (!user) {
    return res.status(404).json({
      success: false,
      errorMessage: "user not found",
    });
  }

  const story = await Story.findOne({ slug: slug }).populate("author likes");
  if (!story) {
    return res.status(404).json({
      success: false,
      errorMessage: "Story not found",
    });
  }

  if (!partial && !story.free && user.free) {
    return res.status(401).json({
      errorMessage: "You need to purchase a premium plan to do this",
    });
  }

  // Create a filtered content array if partial is true
  let filteredContent = story.content; // Default to full content
  if (partial && Array.isArray(chapter)) {
    filteredContent = chapter
      .map((index) => index <= story.content.length - 1 && story.content[index])
      .filter((content) => content !== undefined);
  }

  // Check if user has free access
  if (!user.free) {
    return res.status(200).json({
      success: true,
      data: {
        ...story.toObject(),
        content: filteredContent,
      },
    });
  } else {
    // Check if the user has already purchased the chapters
    const purchasedItem = user.purchased.find((item) => item.slug === slug);
    let chaptersToPurchase = chapter; // Chapters user is trying to purchase

    if (purchasedItem) {
      // Filter out chapters the user already purchased
      chaptersToPurchase = chapter.filter(
        (chap) => !purchasedItem.chapter.includes(chap)
      );
    }

    // If all requested chapters have been purchased, no need to charge
    if (chaptersToPurchase.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          ...story.toObject(),
          content: filteredContent,
        },
        message: "You already have access to these chapters",
      });
    }

    // Check if user has enough vouchers for the chapters they haven't purchased
    const billing = story.prizePerChapter * chaptersToPurchase.length;
    if (user.vouchers >= billing) {
      // Deduct vouchers and update the purchased chapters
      user.vouchers -= billing;

      if (purchasedItem) {
        // If the slug exists, add the new chapters to the existing array
        console.log("chaptersToPurchase: ", ...chaptersToPurchase);
        purchasedItem.chapter.push(...chaptersToPurchase);
        user.markModified("purchased");
      } else {
        // If the slug doesn't exist, add a new entry in purchased
        user.purchased.push({
          slug,
          chapter: chaptersToPurchase, // Store new chapters in an array
        });
      }

      await user.save();
      return res.status(200).json({
        success: true,
        data: {
          ...story.toObject(),
          content: filteredContent,
        },
        message: "Chapters successfully purchased",
      });
    } else {
      return res.status(400).json({
        message: "You do not have enough vouchers to read these chapters",
      });
    }
  }
});

const likeStory = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;
  const activeUser = await User.findOne({ _id: req.user._id });
  if (!activeUser) {
    res.status(404).json({
      errorMessage: "user not found",
    });
  }

  const story = await Story.findOne({
    slug: slug,
  }).populate("author likes");

  const storyLikeUserIds = story.likes.map((json) => json._id.toString());

  if (!storyLikeUserIds.includes(activeUser._id)) {
    story.likes.push(req.user);
    story.likeCount = story.likes.length;
    await story.save();
  } else {
    const index = storyLikeUserIds.indexOf(activeUser._id);
    story.likes.splice(index, 1);
    story.likeCount = story.likes.length;

    await story.save();
  }

  return res.status(200).json({
    success: true,
    data: story,
  });
});

const rateStory = asyncErrorWrapper(async (req, res, next) => {
  const { rating } = req.body; // Assuming the rating is passed in the request body
  const { slug } = req.params;
  const activeUser = await User.findOne({ _id: req.user._id });
  if (!activeUser) {
    res.status(404).json({
      errorMessage: "user not found",
    });
  }

  // Validate the rating value
  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: "Rating must be between 1 and 5.",
    });
  }

  const story = await Story.findOne({ slug: slug }).populate(
    "author ratings.user"
  );

  if (!story) {
    return res.status(404).json({
      success: false,
      message: "Story not found",
    });
  }

  // Check if the user has already rated this story
  const existingRatingIndex = story.ratings.findIndex(
    (i) => i.user._id.toString() === activeUser._id.toString()
  );

  if (existingRatingIndex !== -1) {
    // If the user already rated, update the existing rating
    story.ratings[existingRatingIndex].rating = rating;
  } else {
    // If not, add the new rating
    story.ratings.push({ user: activeUser._id, rating: rating });
  }

  // Calculate new average rating
  const totalRating = story.ratings.reduce((acc, r) => acc + r.rating, 0);
  story.averageRating = totalRating / story.ratings.length;
  story.ratingCount = story.ratings.length;

  // Save the updated story
  await story.save();

  return res.status(200).json({
    success: true,
    data: story,
  });
});

const editStoryPage = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({
    slug: slug,
  }).populate("author likes");

  return res.status(200).json({
    success: true,
    data: story,
  });
});

const editStory = asyncErrorWrapper(async (req, res) => {
  const { slug } = req.params;
  const { title, content, partial, chapter, tags, summary } = req.body;
  if (req.user.role !== "admin") {
    res.status(401).json({
      errorMessage: "you are not allowed to do this",
    });
  }
  const story = await Story.findOne({ slug: slug });

  if (!story) {
    return res.status(404).json({
      success: false,
      message: "Story not found",
    });
  }
  const previousImage = story.image;
  story.title = title || story.title;
  story.tags = tags || story.tags;
  story.summary = summary || story.summary;
  story.image = req.fileLink;

  if (!req.fileLink) {
    story.image = previousImage;
  } else {
    // if the image sent, delete the old image
    deleteImageFile(req, previousImage);
  }

  // Update content based on whether it is partial or full
  if (partial && Array.isArray(chapter) && content) {
    // Update specific chapters
    chapter.forEach((index, i) => {
      if (index >= 0 && index < story.content.length) {
        // If the index exists in the story content, replace the content at that index
        story.content[index] = content[i];
      } else {
        // If the index does not exist, push the new content
        story.content.push(content[i]);
      }
    });

    // story.markModified("content");
  } else if (content && !partial) {
    // If not partial, overwrite the entire content
    story.content = content;
  }

  await story.save();

  return res.status(200).json({
    success: true,
    data: story,
  });
});

const deleteStory = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({ slug: slug });

  deleteImageFile(req, story.image);

  await story.remove();

  return res.status(200).json({
    success: true,
    message: "Story delete succesfully ",
  });
});

module.exports = {
  addStory,
  addImage,
  getAllStories,
  detailStory,
  likeStory,
  rateStory,
  editStoryPage,
  editStory,
  deleteStory,
};
