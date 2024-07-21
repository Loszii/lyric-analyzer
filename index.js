require("dotenv").config();
const cookieParser = require("cookie-parser");
const express = require("express");
const querystring = require("querystring");
const { JSDOM } = require("jsdom");
const { HarmBlockThreshold, HarmCategory, GoogleGenerativeAI } = require("@google/generative-ai");
const markdownIt = require("markdown-it");
const stringSimilarity = require("string-similarity");
const favicon = require("serve-favicon");
const { dirname } = require("path");

//setting up google ai
const safety_settings = [
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    }
];

const genAI = new GoogleGenerativeAI(process.env.AI_KEY);
const model = genAI.getGenerativeModel({model: "gemini-1.5-flash", safetySettings: safety_settings});

const md = markdownIt(); //for markdown to html

const local = process.env.LOCAL; //TRUE or FALSE
let spotify_redirect_uri;
if (local == "TRUE") {
    spotify_redirect_uri = "http://localhost:3000/callback";
} else {
    spotify_redirect_uri = "https://lyric-analyzer.vercel.app/callback";
}

//setting up app
const app = express();
//middleware
app.use((req, res, next) => { //disable cache
    res.set("Cache-Control", "no-store");
    next();
});
app.use(express.text()); //for parsing body
app.use(cookieParser()); //for cookies

//static files
app.use("/", express.static(__dirname + "/public"));
//icon
app.use(favicon(__dirname + "/public/res/favicon.png"));

//main page
app.get("/", async (req, res) => {
    //send user to landing html
    res.sendFile(__dirname + "/public/landing.html");
});

app.get("/api/data", async (req, res) => {
    //gets genius url and image using title and artist
    const q_title = req.query.title;
    const q_artists = req.query.artists;
    const {title, artists, url, img, date} = await genius_search_result(q_title, q_artists);
    res.json({"title": title, "artists": artists, "url": url, "img": img, "date": date});
});

async function genius_search_result(song_name, song_artists) {
    //uses genius api to search for the best fitting song and add its url to object to be returned
    try {
        console.log("Current song is:", song_name + " by " + song_artists);
    
        //search without the "by " for better results
        let encoded_name = encodeURIComponent(song_name + " " + song_artists); //to convert special characters that could mess up call
        let genius_response = await fetch("https://api.genius.com/search?q=" + encoded_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
        let genius_json = await genius_response.json();
    
        let hits = genius_json["response"]["hits"];
        let genius_data = get_best_hit(hits, song_name, song_artists, 0.75); //last param is threshold

        //may still be null but return anyway
        return genius_data;
    } catch (err) {
        console.log("Error in genius seach result:", err.message);
        return {"title": null, "artists": null,"url": null, "img": null, "date": null};
    }
}

function get_best_hit(hits, song_name, song_artists, threshold) {
    //takes in a list of hits from the genius api, uses a string similarity checker to select the best hit possible
    let genius_title = null;
    let genius_artists = null;
    let genius_url = null;
    let genius_img = null;
    let genius_date = null;

    const split_artists = song_artists.split(" "); //split artists so order and amount of artists doesn't matter

    let best_match = 0; 
    for (let i=0; i < hits.length; i++) {
        try {
            const cur_name = hits[i]["result"]["title"];
            const cur_artists = hits[i]["result"]["artist_names"].split(" ");

            //score comparing the titles
            let title_score = stringSimilarity.compareTwoStrings(cur_name.toLowerCase(), song_name.toLowerCase());

            if (title_score >= threshold) {
                //score comparing the artists
                let artists_score = 0;

                //iterate through all the current search results artists (split by spaces) and see if any match closely to our queried artists.
                for (let j=0; j < cur_artists.length; j++) {
                    let cur_match = 0;
                    for (let k=0; k < split_artists.length; k++) {
                        cur_match = Math.max(cur_match, stringSimilarity.compareTwoStrings(cur_artists[j].toLowerCase(), split_artists[k].toLowerCase()));
                    }
                    if (cur_match >= threshold) { //must match above threshold with atleast one of the artists
                        artists_score += cur_match;
                    }
                }

                if (artists_score != 0 && title_score + artists_score > best_match) { //had one artists above threshold and better than last match
                    best_match =  title_score + artists_score;
                    genius_title = hits[i]["result"]["title"];
                    genius_artists = hits[i]["result"]["artist_names"];
                    genius_url = hits[i]["result"]["url"];
                    genius_img = hits[i]["result"]["song_art_image_url"];
                    genius_date = hits[i]["result"]["release_date_for_display"];
                }
            }
        } catch (err) {
            console.log("Error in get best hit:", err.message);
        }
    }
    return {"title": genius_title, "artists": genius_artists, "url": genius_url, "img": genius_img, "date": genius_date};
}

//our api for front end
app.get("/api/lyrics", async (req, res) => {
    //scrapes the lyrics off of genius url in cookies
    let url = req.query.url;

    try { //string for cookies
        let genius_site = await fetch(url);
        let genius_html = await genius_site.text();
        const dom = new JSDOM(genius_html);
        const divs = dom.window.document.querySelectorAll("div");
        let lyrics = ""
        divs.forEach(e => {
            if (e.dataset.lyricsContainer) {
                e.innerHTML = e.innerHTML.replace(/<br\s*\/?>/gi, '\n'); //replacing br with \n
                lyrics += e.textContent + "\n";
            }
        });
        res.send(lyrics);
    } catch (err) {
        console.log("Error in fetching song lyrics:", err.message);
        res.send("null");
    }

});

app.post("/api/analyze", async (req, res) => {
    //generates an analysis of the current selected lyrics
    let title = req.query.title;
    let artists = req.query.artists;

    try {
        const to_prepend = `Your intelligence is being used as a part of my lyric analyzing site. 
        I am going to send you lines of lyrics from ${title} by ${artists}, please deeply analyze each line in about one to two sentences. 
        Since this will be in my website, only analyze the lyrics and respond with no other dialogue please. 
        Try to be creative and not repeat the same stuff to much, including the way you introduce each analysis. 
        Respond with each line as a header placed before its corresponding analysis. Lyrics start now: \n`
        const lyrics = req.body;
        const prompt = to_prepend + lyrics;
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if ((response["promptFeedback"] != undefined && response["promptFeedback"]["blockReason"] == "OTHER") || response["candidates"][0]["finishReason"] == "OTHER") {
            res.send("Cannot analyze specific slurs.");
        } else {
            const text = md.render(response.text());
            res.send(text);
        }
    } catch (err) {
        console.log("Error in analysis:", err.message);
        res.send("ERROR");
    }
});

app.post("/api/summary", async (req, res) => {
    //generates a summary of the current song using all lyrics
    let title = req.query.title;
    let artists = req.query.artists;
    const lyrics = req.body;

    if (lyrics == "") {
        res.send("Without the lyrics I am unable to analyze the current song.");
    } else {
        try {
            let prompt = `Write a summary about the song ${title}, by ${artists}. Here is a copy of the lyrics, ${lyrics}.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            if ((response["promptFeedback"] != undefined && response["promptFeedback"]["blockReason"] == "OTHER") || response["candidates"][0]["finishReason"] == "OTHER") {
                res.send("Cannot analyze specific slurs.");
            } else {
                const text = md.render(response.text());
                res.send(text);
            }
        } catch (err) {
            console.log("Error in summary:", err.message);
            res.send("ERROR");
        }
    }
});



//SPOTIFY STUFF BELOW

//FIX BELOW

app.get("/api/spotify", async (req, res) => {
    //spotify endpoint to get the current title/artists
    let token = req.cookies.token;
    if (token == undefined) {
        //redirect useres to login with spotify and authorize us to see their playback
        if (req.cookies.refresh == undefined) {
            //no refresh token, redirect to spotify site for auth
            console.log("Having user authorize with Spotify");
            res.json({"title": null, "artists": null, "redirect": "https://accounts.spotify.com/authorize?" + querystring.stringify({
                response_type: "code",
                client_id: process.env.CLIENT_ID,
                redirect_uri: spotify_redirect_uri,
                scope: "user-read-currently-playing"
            }
            )});
            return;
        } else {
            //can use refresh token
            console.log("Going to use refresh token");
            token = await get_another_token(req, res); //will get a new access token
        }
    }

    //get the song data
    const {title, artists} = await get_song_data(token); //returns false if error
    
    if (title != null) {
        res.json({"title": title, "artists": artists, "redirect": null});
    } else {
        res.json({"title": null, "artists": null, "redirect": null})
        console.log("FAILED TO STORE SONG DATA");
    }
})

async function get_another_token(req, res) {
    //uses refresh token to set new access token and return it
    const refresh = req.cookies.refresh;

    const data = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "Authorization": "Basic " + (new Buffer.from(process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET).toString("base64")) //converting to base64
        },
        body: new URLSearchParams({ //urlSearchParams encodes in content-type
            grant_type: "refresh_token",
            refresh_token: refresh
        })
    })
    const refresh_data = await data.json();
    if (refresh_data.error != undefined) {
        //refresh token invalid
        res.clearCookie("refresh");
        return null;
    } else {
        const token = refresh_data["access_token"];
        const expires_in = refresh_data["expires_in"];
    
        //setting new token
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: expires_in*1000 // 1 hour typically (1k for mili)
        });
        return token;
    }
}

async function get_song_data(token) {
    //returns song data by calling spotify api
    try {
        let song_name = null;
        let song_artists = [];

        const cur_data = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {headers: {Authorization: `Bearer ${token}`}}); //using our access token
        console.log("Get song response:", cur_data);
        const song_data_json = await cur_data.json();
        console.log("Get song response json:", song_data_json);
        song_name = song_data_json["item"]["name"];
    
        //append artists to song_artists
        for (let i=0; i < song_data_json["item"]["artists"].length; i++) {
            song_artists.push(song_data_json["item"]["artists"][i]["name"]);
        }
        song_artists = song_artists.join(" "); //make string of artists
    
        const regex1 = /\(.*?\)|\[.*?\]/g; //removes all parenthesis and brackets
        const regex2 = / - .*$/; //for - Remastered (removes dash and all after)
        let formatted_name = song_name.replace(regex1, "").replace(regex2, "").trim();
        
        return {"title": formatted_name, "artists": song_artists};
    } catch (err) {
        console.log("Failed to get song data:", err.message);
        return {"title": null, "artists": null};
    }
}

//handling get requests after user login
app.get("/callback", async (req, res) => {

    //get code from login
    const code = req.query.code || null;

    if (code) { //authorized
        try {
            //get token
            const data = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    "Authorization": "Basic " + (new Buffer.from(process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET).toString("base64")) //converting to base64
                },
                body: new URLSearchParams({ //urlSearchParams encodes in content-type
                    grant_type: "authorization_code",
                    code: code, //code returned from login
                    redirect_uri: spotify_redirect_uri
                })
            })
            let token_data = await data.json();
            const token = token_data["access_token"];
            const refresh = token_data["refresh_token"];
            const expires_in = token_data["expires_in"];
            
            //cookies
            console.log("Settings user token:", token);
            res.cookie("token", token, {
                httpOnly: true,
                secure: true,
                maxAge: expires_in*1000 // 1 hour typically (1k for mili)
            });
            res.cookie("refresh", refresh, {
                httpOnly: true,
                secure: true,
            });

            //get song current info
            res.redirect("/");
        } catch (err) {
            console.log("Error in Spotify authorization:", err.message);
            //make the dialogue box state error happened in front end here
            res.sendFile(__dirname + "/public/landing.html");
        }
    } else {
        //user hit cancel
        const error = req.query.error || "Unkown error";
        console.log("Error in Spotify authorization:", error);
        res.sendFile(__dirname + "/public/landing.html");
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {console.log("SERVER STARTED ON PORT", port);});