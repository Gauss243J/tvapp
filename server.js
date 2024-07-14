var dotenv= require('dotenv');
dotenv.config({path: './Config.env'});
var express = require("express");
var app = express();
var http = require("http").createServer(app);
//var socketIO = require("socket.io")(http);
//var http = require('http');
var express = require('express');
var socketIo = require('socket.io');

var formidable = require("formidable");
var fileSystem = require("fs");
var mongoClient = require("mongodb").MongoClient;
var ObjectId = require("mongodb").ObjectId;
var bodyParser = require("body-parser");
var expressSession = require("express-session");
var bcrypt = require("bcryptjs");
const cloudinary = require('cloudinary').v2;
const { getVideoDurationInSeconds } = require('get-video-duration');

//var uri = process.env.DB;

console.log(process.env.ClOUDINARY_CLOUD_NAME);

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.ClOUDINARY_CLOUD_NAME,
	api_key: process.env.ClOUDINARY_PUBLIC_KEY,
	api_secret: process.env.ClOUDINARY_SECRET_KEY
  });

var nodemailer = require("nodemailer");

var mainURL = "http://localhost:3000";


app.use(bodyParser.json( { limit: "10000mb" } ));
app.use(bodyParser.urlencoded( { extended: true, limit: "10000mb", parameterLimit: 1000000 } ));

app.use(expressSession({
	"key": "user_id",
	"secret": "User secret object ID",
	"resave": true,
	"saveUninitialized": true
}));
//const server = http.createServer(app);


app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");


// Routes pour simuler les erreurs
app.get('/exemple-timeout', (req, res, next) => {
    setTimeout(() => {
        let err = new Error('Timeout de la requête');
        err.code = 'ECONNABORTED';
        next(err);
    }, 10000); // Timeout de 10 secondes
});

app.get('/exemple-connexion', (req, res, next) => {
    let err = new Error('Connexion internet non disponible');
    err.code = 'ENOTFOUND';
    next(err);
});

// Middleware pour gérer les erreurs
app.use((err, req, res, next) => {
    if (err.code === 'ECONNABORTED') {
        res.status(504).render('error', { message: "Timeout: La requête a expiré" });
    } else if (err.code === 'ENOTFOUND') {
        res.status(503).render('error', { message: "Service non disponible: Vérifiez votre connexion internet" });
    } else {
        console.error(err.stack);
        res.status(500).render('error', { message: "Une erreur est survenue sur le serveur" });
    }
});




var database = null;

function getUser(userId, callBack) {
	database.collection("users").findOne({
		"_id": ObjectId(userId)
	}, function (error, result) {
		if (error) {
			console.log(error);
			return;
		}
		if (callBack != null) {
			callBack(result);
		}
	});
}

http.listen(process.env.PORT, function () {
	console.log("Server started at http://localhost:3000/");
	const io = socketIo(http);

	io.on('connection', (socket) => {
		console.log('A user connected');
		socket.on('disconnect', () => {
			console.log('User disconnected');
		});
	});

	
	mongoClient.connect(process.env.DB, 
	{
		useNewUrlParser: true,
		useUnifiedTopology: true
	  }, function (error, client) {
		if (error) {
			console.log(error);
			return;
		}
		database = client.db("youtube");

		app.get("/", function (request, result) {

			database.collection("videos").find({}).sort({"createdAt": -1}).toArray(function (error1, videos) {
				result.render("index", {
					"isLogin": request.session.user_id ? true : false,
					"videos": videos,
					"url": request.url
				});
			});
		});

		app.get("/register", function (request, result) {
			if (request.session.user_id) {
				result.redirect("/");
				return;
			}
			result.render("register", {
				"error": "",
				"message": ""
			});
		});

		app.post("/register", function (request, result) {
			var first_name = request.body.first_name;
			var last_name = request.body.last_name;
			var email = request.body.email;
			var password = request.body.password;

			if (first_name == "" || last_name == "" || email == "" || password == "") {
				result.render("register", {
					"error": "Please fill all fields",
					"message": ""
				});
				return;
			}

			database.collection("users").findOne({
				"email": email
			}, function (error1, user) {
				if (error1) {
					console.log(error1);
					return;
				}

				if (user == null) {
					bcrypt.genSalt(10, function(err, salt) {
    					bcrypt.hash(password, salt, async function(err, hash) {
    						database.collection("users").insertOne({
								"first_name": first_name,
								"last_name": last_name,
								"email": email,
								"coverPhoto":"",
								"image":"",
								"password": hash,
								"subscribers": [],
								"subscriptions": [],
								"playlists": [],
								"videos": [],
								"history": [],
								"notifications": [],

							}, function (error2, data) {
								if (error2) {
									console.log(error2);
									return;
								}

								result.render("register", {
									"error": "Email verification",
									"message": "Signed up successfully. You can login now."
								});
							});
    					})
    				})
				} else {
					result.render("register", {
						"error": "Email already exists",
						"message": ""
					});
				}
			});
		});

		app.get("/login", function (request, result) {
			if (request.session.user_id) {
				result.redirect("/");
				return;
			}
			result.render("login", {
				"error": "",
				"message": ""
			});
		});

		app.post("/login", function (request, result) {
			var email = request.body.email;
			var password = request.body.password;

			if (email == "" || password == "") {
				result.render("login", {
					"error": "Please fill all fields",
					"message": ""
				});
				return;
			}

			database.collection("users").findOne({
				"email": email
			}, function (error1, user) {
				if (error1) {
					console.log(error1);
					return;
				}

				if (user == null) {
					result.render("login", {
						"error": "Email does not exist",
						"message": ""
					});
				} else {
					bcrypt.compare(password, user.password, function (error2, res) {
						if (res === true) {
							request.session.user_id = user._id;
							result.redirect("/");
						} else {
							result.render("login", {
								"error": "Password is not correct",
								"message": ""
							});
						}
					});
				}
			});
		});

		app.get("/logout", function (request, result) {
			request.session.destroy();
			result.redirect("/login");
		});

		app.get("/upload", function (request, result) {
			if (request.session.user_id) {
				getUser(request.session.user_id, function (user) {
					result.render("upload", {
						"isLogin": true,
						"user": user,
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/get_user", function (request, result) {
			if (request.session.user_id) {
				getUser(request.session.user_id, function (user) {
					if (user == null) {
						result.json({
							"status": "error",
							"message": "User not found"
						});
					} else {
						delete user.password;

						result.json({
							"status": "success",
							"message": "Record has been fetched",
							"user": user
						});
					}
				});
			} else {
				result.json({
					"status": "error",
					"message": "Please login to perform this action."
				});
			}
		});

		app.post("/upload-videos", function (request, result) {
			if (request.session.user_id) {
				var formData = new formidable.IncomingForm();
				formData.maxFileSize = 1000 * 1024 * 1204;
				formData.parse(request, function (error1, fields, files) {
					var oldPath = files.video.path;
					var newPath = "public/videos/" + new Date().getTime() + "-" + files.video.name;

					var title = fields.title;
					var description = fields.description;
					var tags = fields.tags;
					var videoId = fields.videoId;
					var thumbnail = fields.thumbnailPath;

					var oldPathThumbnail = files.thumbnail.path;
					var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;

					fileSystem.rename(oldPathThumbnail, thumbnail, function (error2) {
						console.log("thumbnail upload error = ", error2);
					});

					fileSystem.rename(oldPath, newPath, function (error2) {
						getUser(request.session.user_id, function (user) {
							
							delete user.password;
							var currentTime = new Date().getTime();

							getVideoDurationInSeconds(newPath).then((duration) => {

								var hours = Math.floor(duration / 60 / 60);
								var minutes = Math.floor(duration / 60) - (hours * 60);
								var seconds = Math.floor(duration % 60);

								database.collection("videos").insertOne({
									"user": {
										"_id": user._id,
										"first_name": user.first_name,
										"last_name": user.last_name,
										"image": user.image,
										"subscribers": user.subscribers
									},
									"filePath": newPath,
									"createdAt": currentTime,
									"views": 0,
									"watch": currentTime,
									"minutes": minutes,
									"seconds": seconds,
									"hours": hours,
									"title": title,
									"description": description,
									"tags": tags,
									"category": fields.category,
									"thumbnail": thumbnail,
									"playlist":"",
									"likers":[],
									"dislikers":[],
									"comments":[]
								}, function (error3, data) {

									database.collection("users").updateOne({
										"_id": ObjectId(request.session.user_id)
									}, {
										$push: {
											"videos": {
												"_id": data.insertedId,
												"filePath": newPath,
												"createdAt": currentTime,
												"views": 0,
												"watch": currentTime,
												"minutes": minutes,
												"seconds": seconds,
												"hours": hours,
												"title": title,
												"description": description,
												"tags": tags,
												"category": fields.category,
												"thumbnail": thumbnail
											}
										}
									}, function (error4, data1) {
										result.redirect("/edit?v=" + currentTime);
									});
								});
							});
						});
					});
				});
			} else {
				result.json({
					"status": "error",
					"message": "Please login to perform this action."
				});
			}
		});

		app.post("/upload-video", function (request, result) {
			if (request.session.user_id) {
				const form = new formidable.IncomingForm();
				form.maxFileSize = 1000 * 1024 * 1204; // Adjust as needed
		
				getUser(request.session.user_id, function (user) {
				form.parse(request, async (error, fields, files) => {
					if (error) {
						return result.status(400).json({ status: "error", message: "File upload error." });
					}
		
					const videoFile = files.video;
					const thumbnailFile = files.thumbnail;
		
					// Validate file types and sizes here
		
					const { title, description, tags, category } = fields;
				
		
					try {
						// Upload video to Cloudinary
						const videoUploadResult = await cloudinary.uploader.upload(videoFile.path, {
							resource_type: "video",
							folder: "videos"
						});
		
						// Upload thumbnail to Cloudinary
						const thumbnailUploadResult = await cloudinary.uploader.upload(thumbnailFile.path, {
							resource_type: "image",
							folder: "thumbnails"
						});
						
						//const user = await getUser(request.session.user_id);
						delete user.password;
		
						const duration = await getVideoDurationInSeconds(videoUploadResult.secure_url);
						const hours = Math.floor(duration / 3600);
						const minutes = Math.floor((duration % 3600) / 60);
						const seconds = Math.floor(duration % 60);
						const currentTime = Date.now();
		
						const videoData = {
							user: {
								_id: user._id,
								first_name: user.first_name,
								last_name: user.last_name,
								image: user.image,
								subscribers: user.subscribers,
							},
							filePath: videoUploadResult.secure_url,
							createdAt: currentTime,
							views: 0,
							watch: currentTime,
							minutes,
							seconds,
							hours,
							title,
							description,
							tags,
							category,
							thumbnail: thumbnailUploadResult.secure_url,
							playlist: "",
							likers: [],
							dislikers: [],
							comments: [],
						};
		
						const videoInsertResult = await database.collection("videos").insertOne(videoData);
		
						await database.collection("users").updateOne(
							{ _id: ObjectId(request.session.user_id) },
							{
								$push: {
									videos: {
										_id: videoInsertResult.insertedId,
										...videoData,
									},
								},
							}
						);
						
						result.redirect(`/edit?v=${currentTime}`);
					} catch (err) {
						result.status(500).json({ status: "error", message: "Server error." });
					}
				}); });
			} else {
				result.status(401).json({ status: "error", message: "Please login to perform this action." });
			}
		});
		

		app.post("/save-video", function (request, result) {
			if (request.session.user_id) {
				var title = request.body.title;
				var description = request.body.description;
				var tags = request.body.tags;
				var videoId = request.body.videoId;

				database.collection("users").findOne({
					"_id": ObjectId(request.session.user_id),
					"videos._id": ObjectId(videoId)
				}, function (error1, video) {
					if (video == null) {
						result.send("Sorry you do not own this video");
					} else {
						database.collection("videos").updateOne({
							"_id": ObjectId(videoId)
						}, {
							$set: {
								"title": title,
								"description": description,
								"tags": tags,
								"category": request.body.category,
								"minutes": request.body.minutes,
								"seconds": request.body.seconds
							}
						}, function (error1, data) {

							database.collection("users").findOneAndUpdate({
								$and: [{
									"_id": ObjectId(request.session.user_id)
								}, {
									"videos._id": ObjectId(videoId)
								}]
							}, {
								$set: {
									"videos.$.title": title,
									"videos.$.description": description,
									"videos.$.tags": tags,
									"videos.$.category": request.body.category,
									"videos.$.minutes": request.body.minutes,
									"videos.$.seconds": request.body.seconds
								}
							}, function (error2, data1) {
								result.json({
									"status": "success",
									"message": "Video has been published"
								});
							});
						});
					}
				});
			} else {
				result.json({
					"status": "danger",
					"message": "Please login to perform this action."
				});
			}
		});

		app.post("/edit", function (request, result) {
		
			if (request.session.user_id) {

				var formData = new formidable.IncomingForm();
				formData.parse(request, function (error1, fields, files) {
					var title = fields.title;
					var description = fields.description;
					var tags = fields.tags;
					var videoId = fields.videoId;
					var thumbnail = fields.thumbnailPath;
					var watch = parseInt(request.query.v)

					if (files.thumbnail.size > 0) {
						
						if (typeof fields.thumbnailPath !== "undefined" && fields.thumbnailPath != "") {
							fileSystem.unlink(fields.thumbnailPath, function (error3) {
								//
							});
						}

						var oldPath = files.thumbnail.path;
						var newPath = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;
						thumbnail = newPath;

						fileSystem.rename(oldPath, newPath, function (error2) {
							//
						});
					}

					database.collection("users").findOne({
						"_id": ObjectId(request.session.user_id),
						"videos._id": ObjectId(videoId)
					}, function (error1, Mainvideo) {
						//console.log(Mainvideo)
						if (Mainvideo == null) {
							result.send("Sorry you do not own this video");
						} else {
							database.collection("videos").findOneAndUpdate({
								"_id": ObjectId(videoId)
							}, {
								$set: {
									"title": title,
									"description": description,
									"tags": tags,
									"category": fields.category,
									"thumbnail": thumbnail,
									"playlist": fields.playlist

								}
							}, function (error1, data) {

							if(fields.playlist==""){		
								database.collection("users").findOneAndUpdate({
									$and: [{
										"_id": ObjectId(request.session.user_id)
									}, {
										"videos._id": ObjectId(videoId)
									}]
								}, {
									$set: {
										"videos.$.title": title,
										"videos.$.description": description,
										"videos.$.tags": tags,
										"videos.$.category": fields.category,
										"videos.$.thumbnail": thumbnail,
										//"videos.$.playlist": playlist
									}
								}, /*function (error2, data1) {
									getUser(request.session.user_id, function (user) {
										var video = data.value;
										video.thumbnail = thumbnail;

										result.render("edit-video", {
											"isLogin": true,
											"video": video,
											"user": user,
											"url": request.url,
											"message": "Video has been saved"
										});
									});
								}*/);
								database.collection("users").updateOne({
									$and: [{
										"_id": ObjectId(request.session.user_id)
									},{
										"playlists._id": ObjectId(Mainvideo.playlist)
									}]
								},{
									$pull:{
										"playlists.$.videos":{
											"_id":fields.videoId
										}
									}

								});
							} else {
								if(Mainvideo.playlist != ""){
									
									
									database.collection("users").updateOne({
										$and:[{
											"_id":ObjectId(request.session.user_id)
										},{
											"playlists._id" : ObjectId(Mainvideo.playlist)
										}]
									},{
										$pull: {
											"playlists.$.videos":{
												"_id": fields.videoId
											}
										}
									});
								}

								database.collection("videos").findOne({
									"user._id": ObjectId(request.session.user_id),
									"_id": ObjectId(videoId)
								}, function (error1, Mvideo) {
									console.log(Mvideo)
									if (Mvideo == null) {
										result.send("Sorry you do not own this video");
									} else {
									
											                 // Emit the Socket.IO event to notify clients of the update
												 io.emit('playlistUpdated', {
													playlistId: fields.playlist,
													video: {
														_id: fields.videoId,
														title: fields.title,
														watch: watch,
														thumbnail: thumbnail,
														filePath: Mvideo.filePath
													}
												});

								database.collection("users").updateOne({
									$and:[{
										"_id": ObjectId(request.session.user_id)
									},{
										"playlists._id":ObjectId(fields.playlist)
									}]
								},{
									$push:{
										"playlists.$.videos":{
											"_id":fields.videoId,
											"title":fields.title,
											"watch": watch,
											"thumbnail": thumbnail,
											"filePath": Mvideo.filePath
										}
									}
								});
							} });
								
							}
							
							//result.redirect("/edit/?v="+ Mainvideo.videos.watch);
							getUser(request.session.user_id, function (user) {
								var video = data.value;
								video.thumbnail = thumbnail;

								result.render("edit-video", {
									"isLogin": true,
									"video": video,
									"user": user,
									"url": request.url,
									"message": "Video has been saved"
								});
							});
							});
						}
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/watch", function (request, result) {
			database.collection("videos").findOne({
				"watch": parseInt(request.query.v)
			}, function (error1, video) {
				if (video == null) {
					result.render("404", {
						"isLogin": request.session.user_id ? true : false,
						"message": "Video does not exist.",
						"url": request.url
					});
				} else {

					database.collection("videos").updateOne({
						"_id": ObjectId(video._id)
					}, {
						$inc: {
							"views": 1
						}
					});

					database.collection("users").updateOne({
						$and: [{
							"_id": ObjectId(video.user._id)
						}, {
							"videos._id": ObjectId(video._id)
						}]
					}, {
						$inc: {
							"videos.$.views": 1
						}
					});

					getUser(video.user._id, function (user) {
						result.render("video-page", {
							"isLogin": request.session.user_id ? true : false,
							"video": video,
							"user": user,
							"url": request.url,
							"playlist": [],
							"playlistId": ""
						});
						//console.log(video)
					});
				}
			});
		});

		app.get("/channel", function (request, result) {
			database.collection("users").findOne({
				"_id": ObjectId(request.query.c)
			}, function (error1, user) {
				if (user == null) {
					result.render("404", {
						"isLogin": request.session.user_id ? true : false,
						"message": "Channel not found",
						"url": request.url
					});
				} else {
					result.render("single-channel", {
						"isLogin": request.session.user_id ? true : false,
						"user": user,
						"headerClass": "single-channel-page",
						"footerClass": "ml-0",
						"isMyChannel": request.session.user_id == request.query.c,
						"error": request.query.error ? request.query.error : "",
						"url": request.url,
						"message": request.query.message ? request.query.message : "",
						"error": ""
					});
				}
			});
		});

		app.get("/my_channel", function (request, result) {
			if (request.session.user_id) {
				database.collection("users").findOne({
					"_id": ObjectId(request.session.user_id)
				}, function (error1, user) {
					result.render("single-channel", {
						"isLogin": true,
						"user": user,
						"headerClass": "single-channel-page",
						"footerClass": "ml-0",
						"isMyChannel": true,
						"message": request.query.message ? request.query.message : "",
						"error": request.query.error ? request.query.error : "",
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});


		app.get("/my_channels", function (request, result) {
			if (request.session.user_id) {
				database.collection("users").findOne({
					"_id": ObjectId(request.session.user_id)
				}, function (error1, user) {
					result.render("channel-admin", {
						"isLogin": true,
						"user": user,
						"headerClass": "single-channel-page",
						"footerClass": "ml-0",
						"isMyChannel": true,
						"message": request.query.message ? request.query.message : "",
						"error": request.query.error ? request.query.error : "",
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/edit", function (request, result) {
			if (request.session.user_id) {
				database.collection("videos").findOne({
					"watch": parseInt(request.query.v)
				}, function (error1, video) {
					if (video == null) {
						result.render("404", {
							"isLogin": true,
							"message": "This video does not exist.",
							"url": request.url
						});
					} else {
						if (video.user._id != request.session.user_id) {
							result.send("Sorry you do not own this video.");
						} else {
							getUser(request.session.user_id, function (user) {
								result.render("edit-video", {
									"isLogin": true,
									"video": video,
									"user": user,
									"url": request.url
								});
							});
						}
					}
				});
			} else {
				result.redirect("/login");
			}
		});

		app.post("/do-like", function (request, result) {
			result.json({
				"status": "success",
				"message": "Like/dislike feature is in premium version. Kindly read README.txt to get full version."
			});
		});

		app.post("/do-dislike", function (request, result) {
			result.json({
				"status": "success",
				"message": "Like/dislike is in premium version. Kindly read README.txt to get full version."
			});
		});

		app.post("/do-comment", function (request, result) {
			if (request.session.user_id) {
				var comment = request.body.comment;
				var videoId = request.body.videoId;

				getUser(request.session.user_id, function (user) {
					delete user.password;

					database.collection("videos").findOneAndUpdate({
						"_id": ObjectId(videoId)
					}, {
						$push: {
							"comments": {
								"_id": ObjectId(),
								"user": {
									"_id": user._id,
									"first_name": user.first_name,
									"last_name": user.last_name,
									"image": user.image
								},
								"comment": comment,
								"createdAt": new Date().getTime()
							}
						}
					}, function (error1, data) {
						result.json({
							"status": "success",
							"message": "Comment has been posted",
							"user": {
								"_id": user._id,
								"first_name": user.first_name,
								"last_name": user.last_name,
								"image": user.image
							},
							"comment": comment
						});
					});
				});
			} else {
				result.json({
					"status": "danger",
					"message": "Please login to perform this action."
				});
			}
		});

		app.post("/do-reply", function (request, result) {
			if (request.session.user_id) {
				var reply = request.body.reply;
				var commentId = request.body.commentId;

				getUser(request.session.user_id, function (user) {
					delete user.password;

					var replyObject = {
						"_id": ObjectId(),
						"user": {
							"_id": user._id,
							"first_name": user.first_name,
							"last_name": user.last_name,
							"image": user.image
						},
						"reply": reply,
						"createdAt": new Date().getTime()
					};

					database.collection("videos").findOneAndUpdate({
						"comments._id": ObjectId(commentId)
					}, {
						$push: {
							"comments.$.replies": replyObject
						}
					}, function (error1, data) {
						result.json({
							"status": "success",
							"message": "Reply has been posted",
							"user": {
								"_id": user._id,
								"first_name": user.first_name,
								"last_name": user.last_name,
								"image": user.image
							},
							"reply": reply
						});
					});
				});
			} else {
				result.json({
					"status": "danger",
					"message": "Please login to perform this action."
				});
			}
		});

		app.get("/get-related-videos", function (request, result) {
			database.collection("videos").find({
				$and: [{
					"category": request.query.category
				}, {
					"_id": {
						$ne: ObjectId(request.query.videoId)
					}
				}]
			}).toArray(function (error1, videos) {
				result.json(videos);
			});
		});

		app.get("/search", function (request, result) {

			database.collection("videos").find({
				"title":  {
					$regex: request.query.search_query,
					$options: "i"
				}
			}).toArray(function (error1, videos) {
				result.render("search-query", {
					"isLogin": request.session.user_id ? true : false,
					"videos": videos,
					"query": request.query.search_query,
					"url": request.url
				});
			});
		});

		app.get("/my_settings", function (request, result) {
			if (request.session.user_id) {
				getUser(request.session.user_id, function (user) {
					result.render("settings", {
						"isLogin": true,
						"user": user,
						"message": request.query.message ? "Settings has been saved" : "",
						"error": request.query.error ? "Please fill all fields" : "",
						"url": request.url
					});
				});
			} else {
				result.redirect("/login");
			}
		});

		app.post("/save_settings", function (request, result) {
			if (request.session.user_id) {
				var password = request.body.password;

				if (request.body.first_name == "" || request.body.last_name == "") {
					result.redirect("/my_settings?error=1");
					return;
				}

				if (password == "") {
					database.collection("users").updateOne({
						"_id": ObjectId(request.session.user_id)
					}, {
						$set: {
							"first_name": request.body.first_name,
							"last_name": request.body.last_name
						}
					});
				} else {
					bcrypt.genSalt(10, function(err, salt) {
						bcrypt.hash(password, salt, async function(err, hash) {
							database.collection("users").updateOne({
								"_id": ObjectId(request.session.user_id)
							}, {
								$set: {
									"first_name": request.body.first_name,
									"last_name": request.body.last_name,
									"password": hash
								}
							})
						})
					})
				}

				database.collection("users").updateOne({
					"subscriptions.channelId": ObjectId(request.session.user_id)
				}, {
					$set: {
						"subscriptions.$.channelName": request.body.first_name + " " + request.body.last_name
					}
				});

				database.collection("users").updateOne({
					"subscriptions.subscribers.userId": ObjectId(request.session.user_id)
				}, {
					$set: {
						"subscriptions.subscribers.$.channelName": request.body.first_name + " " + request.body.last_name
					}
				});

				database.collection("users").updateOne({
					"subscribers.userId": ObjectId(request.session.user_id)
				}, {
					$set: {
						"subscribers.$.channelName": request.body.first_name + " " + request.body.last_name
					}
				});

				database.collection("videos").updateOne({
					"user._id": ObjectId(request.session.user_id)
				}, {
					$set: {
						"user.first_name": request.body.first_name,
						"user.last_name": request.body.last_name
					}
				});

				result.redirect("/my_settings?message=1");
			} else {
				result.redirect("/login");
			}
		});

		app.post("/update-social-media-link", function (request, result) {
			result.json({
				"status": "success",
				"message": "Video has been liked"
			});
		});

		app.get("/delete-video", function (request, result) {
			if (request.session.user_id) {
				database.collection("videos").findOne({
					$and: [{
						"user._id": ObjectId(request.session.user_id)
					}, {
						"watch": parseInt(request.query.v)
					}]
				}, function (error1, video) {
					if (video == null) {
						result.render("404", {
							"isLogin": true,
							"message": "Sorry, you do not own this video."
						});
					} else {
						database.collection("videos").findOne({
							"_id": ObjectId(video._id)
						}, function (error3, videoData) {

					    // Supprimer la vidéo de Cloudinary
					    cloudinary.uploader.destroy(videoData.filePath, function (error, result) {
								if (error) {
									console.log(error);
									return result.render("500", {
									 "isLogin": true,
									 "message": "An error occurred while deleting the video."
								});}

								database.collection("videos").remove({
									$and: [{
										"_id": ObjectId(video._id)
									}, {
										"user._id": ObjectId(request.session.user_id)
									}]
								});
							});
						

							/*fileSystem.unlink(videoData.filePath, function (errorUnlink) {
								if (errorUnlink) {
									console.log(errorUnlink);
								}

								database.collection("videos").remove({
									$and: [{
										"_id": ObjectId(video._id)
									}, {
										"user._id": ObjectId(request.session.user_id)
									}]
								});
							});*/
						});

							database.collection("users").updateOne(
								{
									"_id": ObjectId(request.session.user_id),
									"playlists.videos._id": (video._id).toString().replace(/^"|"$/g, '') // Vérification supplémentaire de l'existence
								},
								{
									$pull: {
										"playlists.$[].videos": { "_id": (video._id).toString().replace(/^"|"$/g, '') }
									}
								},
								function (error2, data) {
																	// Emit the Socket.IO event to notify clients of the update
							io.emit('videoDeleted', { _id: video._id });
															
						    console.log("Vidéo retirée de la playlist avec succès:", video._id);

									}
							);

						database.collection("users").updateOne({
							"_id": ObjectId(request.session.user_id)
						}, {
							$pull: {
								"videos": {
									"_id": ObjectId(video._id)
								}
							}
						}, function (error2, data) {
							result.redirect("/my_channel");
						});
					}
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/pro-version", function (request, result) {
			result.render("pro-version", {
				"isLogin": request.session.user_id ? true : false,
				"url": request.url
			});
		});

		app.post("/create-playlist", function (request,result){
			if(request.session.user_id){
				database.collection("users").updateOne({
					"_id":ObjectId(request.session.user_id)

					},{
						$push:{
							"playlists":{
								"_id":ObjectId(),
								"title":request.body.title,
								"videos":[]
							}
						}
				});
				result.redirect("/my_channel")
			} else {
				result.redirect("/login")
			}
		
		});

		app.get("/edit/:watch", function (request, result) {
			if (request.session.user_id) {
				database.collection("videos").findOne({
					$and:[{
						"watch": parseInt(request.params.watch)
					},{
						"user._id": ObjectId(request.session.user_id)}]
				}, function (error, video) {
					if (video == null) {
						result.send("Sorry you do not own this video.");
					} else {
						getUser(request.session.user_id, function(user){
							result.render("edit-video", {
								"isLogin":true,
								"video": video,
								"user": user
							});
						});
					}
				});
			} else {
				result.redirect("/login");
			}
		});

		app.get("/watch/:watch", function (request, result) {
			database.collection("videos").findOne({
				"watch": parseInt(request.params.watch)
			}, function (error, video) {
				if (video == null) {
					result.render("404", {
						"isLogin": request.session.user_id ? true : false,
						"message": "Video does not exist.",
						"url": request.url
					});
				} else {

					database.collection("videos").updateOne({
						"_id": ObjectId(video._id)
					}, {
						$inc: {
							"views": 1
						}
					});
					result.render("video-page/index", {
						"isLogin": request.session.user_id ? true : false,
						"video": video,
						"playlist": [],
						"playlistId": ""
						
					})
				}
			});
		});

		app.get("channel/:_id", function(request, result){
			getUser(request.params._id, function (user){
				if(user == null){
					result.send("Channel not found");
				}
				else{
					result.render("single-channel",{
						"isLogin":request.session.user_id ? true : false,
						"user":user,
						"isMyChannel": request.session.user_id == request.params._id
					})
				}
			})
		});

		app.get("/playlist/:_id/:watch", function(request, result){ 
			database.collection("videos").findOne({
				$and:[{
					"watch": parseInt(request.params.watch)
				},{
					"playlist": request.params._id
				}]
			}, function (error, video){
		
				if(video==null){
				//result.send("Video does not exist.");
				result.render("404", {
					"isLogin": request.session.user_id ? true : false,
					"message": "Video does not exist.",
					"url": request.url
				});
			} else {
				database.collection("videos").updateMany({
					"_id":ObjectId(video._id)
				},{
					$inc: {
						"views": 1
					}
				});

				getUser(video.user._id, function(user){
					var playlistVideos = [];
					for (var a=0; a<user.playlists.length; a++){
						if(user.playlists[a]._id == request.params._id){
							playlistVideos=user.playlists[a].videos;
							break;
						}
					}

						result.render("video-page/indexe", {
							"isLogin": request.session.user_id ? true : false,
							"video": video,
							"user": user,
							"url":  "localhost:3000/",//"watch?v="+ video.watch
							"playlist": playlistVideos,
							"playlistId": request.params._id
						});

						//console.log(video);
						//console.log(playlistVideos);
						/*console.log(request.params._id);*/
			});
			}
		});
	});


app.get("/playlistes/:_id/:watch", function(request, result){ 
			database.collection("videos").findOne({
				$and:[{
					"watch": parseInt(request.params.watch)
				},{
					"playlist": request.params._id
				}]
			}, function (error, video){
		
				if(video==null){
				//result.send("Video does not exist.");
				result.render("404", {
					"isLogin": request.session.user_id ? true : false,
					"message": "Video does not exist.",
					"url": request.url
				});
			} else {
				database.collection("videos").updateMany({
					"_id":ObjectId(video._id)
				},{
					$inc: {
						"views": 1
					}
				});

				getUser(video.user._id, function(user){
					var playlistVideos = [];
					var playlistLinks = [];
					for (var a=0; a<user.playlists.length; a++){
						if(user.playlists[a]._id == request.params._id){
							playlistVideos=user.playlists[a].videos;
							for (var b=0; b<user.playlists[a].videos.length; b++){
							playlistLinks.push(user.playlists[a].videos[b].filePath);
							}
							break;
						}
					}

				result.json(playlistLinks);
			});
			}
		});
	});



		

	app.get("/playlists/:_id/:watch", function(request, result){ 
		database.collection("videos").findOne({
			$and:[{
				"watch": parseInt(request.params.watch)
			},{
				"playlist": request.params._id
			}]
		}, function (error, video){
	
			if(video==null){
			//result.send("Video does not exist.");
			result.render("404", {
				"isLogin": request.session.user_id ? true : false,
				"message": "Video does not exist.",
				"url": request.url
			});
		} else {
			database.collection("videos").updateMany({
				"_id":ObjectId(video._id)
			},{
				$inc: {
					"views": 1
				}
			});

			getUser(video.user._id, function(user){
				var playlistVideos = [];
				for (var a=0; a<user.playlists.length; a++){
					if(user.playlists[a]._id == request.params._id){
						playlistVideos=user.playlists[a].videos;
						break;
					}
				}

					result.render("video-page/index-admin", {
						"isLogin": request.session.user_id ? true : false,
						"video": video,
						"user": user,
						"url":  "localhost:3000/",//"watch?v="+ video.watch
						"playlist": playlistVideos,
						"playlistId": request.params._id
					});

					//console.log(video);
					//console.log(playlistVideos);
					/*console.log(request.params._id);*/
		});
		}
	});
});


	}); // end of Mongo DB
}); //  end of HTTP.listen
