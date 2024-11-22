const Story = require("../Models/story");

const getTitleSuggestions = async (req, res) => {
    try {
      const query = req.query.q || '';
      console.log(query);
      
      if (!query.trim()) {
        return res.status(200).json({
          success: true,
          suggestions: []
        });
      }
  
      // Find up to 10 stories where title starts with the query
      const suggestions = await Story.find(
        { 
          title: { 
            $regex: new RegExp(`^${query}`, 'i') 
          } 
        },
        { 
          title: 1, 
          slug: 1, 
          _id: 0 
        })
        .limit(10)
        .lean();
  
      return res.status(200).json({
        success: true,
        suggestions
      });
    } catch (error) {
      console.error('Error in getTitleSuggestions:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  };
  
  module.exports = {
    getTitleSuggestions
  };