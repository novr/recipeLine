const request = require("superagent");
const lineEndpoint = "https://api.line.me/v2/bot/message/reply";
const lineAccessToken = process.env.LINE_ACCESS_TOKEN;
const recipeEndpoint = "https://app.rakuten.co.jp/services/api/Recipe/CategoryRanking/20170426";
const recipeApplicationId = process.env.RECIPE_APPLICATION_ID;
const category = require('category');

const taskInitialize = (data, context) => {
  return new Promise((resolve,reject) =>{
    const stash = {
      data: data,
      text: data.message.text,
      message : {
        replyToken: data.replyToken,
        messages: []
      },
      categoryId: "",
      categoryName: "",
      recipes: []
    };
    console.log(`#taskInitialize\t stash:${JSON.stringify(data)}`);
    resolve(stash);
  });
};

const taskGetCategory = (stash) => {
  return new Promise((resolve,reject) => {
    stash.categoryId = category[stash.text];
    stash.categoryName = stash.text;
    if (!stash.categoryId) {
      stash.categoryId = "";
      stash.categoryError = true;
    }
    console.log(`#taskGetCategory\t categoryId:${stash.categoryId},categoryName:${stash.categoryName}`);
    resolve(stash);
  });

};

const taskGetRecipe = (stash) => {
  return new Promise((resolve,reject) => {
    request.get(recipeEndpoint)
      .query({
        applicationId: recipeApplicationId,
        format: 'json',
        categoryId: stash.categoryId
      }).end(function(err, reply){
        if (reply.statusCode === 200){
          stash.recipes = reply.body.result;
          console.log(`#taskGetRecipe\t recipes:${JSON.stringify(stash.recipes)}`);
          resolve(stash);
        } else {
          stash.message.messages.push({
            'type': 'text',
            'text': reply.body.error_description
          });
          console.log(`#taskGetRecipe\t error:${JSON.stringify(reply.body.error_description)}`);
          resolve(stash);
        }
      });
  });
};

const taskCreateMessage = (stash) => {
  return new Promise((resolve,reject) => {
    if (stash.categoryError) {
      stash.message.messages.push({
        "type": "text",
        "text": `${stash.text} のカテゴリが見つからなかったので、ランキングの検索結果`
      });
    } else {
      stash.message.messages.push({
        "type": "text",
        "text": `${stash.categoryName} の検索結果`
      });
    }
    let carousel = {
      "type": "template",
      "altText": `${stash.categoryName} の検索結果`,
      "template": {
          "type": "carousel",
          "columns": []
      }
    };
    stash.recipes.some(function(recipe) {
      if (carousel.template.columns.length > 5) {
        return true;
      }
      carousel.template.columns.push({
        "thumbnailImageUrl": recipe.foodImageUrl,
        "title": recipe.recipeTitle,
        "text": recipe.recipeDescription.substr(0,60),
        "actions": [
          {
            "type": "uri",
            "label": "レシピを見る",
            "uri": recipe.recipeUrl
          }
        ]
      });
    });
    stash.message.messages.push(carousel);
    console.log(`#taskCreateMessage\t message:${JSON.stringify(stash.message)}`);
    resolve(stash);
  });
};

const taskSendMessage = (stash) => {
  return new Promise((resolve,reject) => {
    request.post(lineEndpoint)
            .set('Content-type', 'application/json; charset=UTF-8')
            .set('Authorization',  'Bearer ' + lineAccessToken)
            .send(stash.message)
            .end(function(err, reply){
              console.log(`#taskSendMessage\t reply:${JSON.stringify(reply)}`)
              if (reply.statusCode === 200){
                  resolve(stash);
              }else{
                  reject(err);
              }
            });
  });
}

module.exports.hello = (event, context, callback) => {
  var body = JSON.parse(event.body);
  body.events.forEach(function(data) {
    taskInitialize(data, context)
      .then(taskGetCategory)
      .then(taskGetRecipe)
      .then(taskCreateMessage)
      .then(taskSendMessage)
      .then(callback.bind(null,null))
      .catch(callback);
  });
};
