const Story = require("../Models/story");

const getStorySearchSuggestions = async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    
    if (!query.trim()) {
      return res.status(200).json({
        success: true,
        suggestions: []
      });
    }
    
    // Safely escape regex special characters to prevent injection
    const sanitizedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(sanitizedQuery, 'i');
    
    // Find stories that match in title or summary only (not content)
    const stories = await Story.aggregate([
      {
        $match: {
          $or: [
            { title: { $regex: searchRegex } },
            { summary: { $regex: searchRegex } }
          ]
        }
      },
      // Look up author information
      {
        $lookup: {
          from: "users",
          localField: "author",
          foreignField: "_id",
          as: "authorInfo",
          pipeline: [
            { $project: { username: 1, _id: 1 } }
          ]
        }
      },
      { $unwind: "$authorInfo" },
      // Add a field to identify where the match was found
      {
        $addFields: {
          matchType: {
            $cond: {
              if: { $regexMatch: { input: "$title", regex: searchRegex } },
              then: "title",
              else: "summary"
            }
          }
        }
      },
      // Project only necessary fields
      {
        $project: {
          _id: 1,
          title: 1,
          slug: 1,
          // Fix: Use $substrCP instead of $substr and handle null values
          summary: {
            $cond: {
              if: { $ne: ["$summary", null] },
              then: { $substrCP: ["$summary", 0, 150] },
              else: ""
            }
          },
          image: 1,
          matchType: 1,
          author: "$authorInfo.username",
          authorId: "$authorInfo._id",
          tags: 1
        }
      },
      { $limit: limit }
    ]);
    
    return res.status(200).json({
      success: true,
      suggestions: stories
    });
  } catch (error) {
    console.error('Error in getStorySearchSuggestions:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  getStorySearchSuggestions
};