const searchHelper = (searchKey, query, searchQuery) => {

    if (searchQuery) {

        const searchObject = {};

        const regex = new RegExp(searchQuery, "i")

        searchObject[searchKey] = regex

        query = query.where(searchObject);
      
        return query
    }

    return query;
}


const paginateHelper = async (model, query, req)=> {

    const page = parseInt( req.query.page ) || 1 ; 
    const pageSize = parseInt( req.query.limit ) || 3 ; 
    const skip  = (page-1 ) * pageSize ; 
   
    const regex = new RegExp(req.query.search, "i")    

    const total = await model.countDocuments({"title" : regex})
  
    const pages = Math.ceil(total / pageSize )  ;

    query = query.skip(skip).limit(pageSize) ; 

    return {
        query : query  ,
        page : page ,
        pages : pages  
    }

}


module.exports ={
    searchHelper,
    paginateHelper
}