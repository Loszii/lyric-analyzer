require("dotenv").config();
const cookieParser = require('cookie-parser');
const express = require("express");
const querystring = require("querystring");
const { JSDOM } = require("jsdom");
const { HarmBlockThreshold, HarmCategory, GoogleGenerativeAI } = require("@google/generative-ai");
const markdownIt = require("markdown-it");
const stringSimilarity = require("string-similarity");

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


//setting up app
const app = express();
app.use(express.json()); //for parsing body
app.use(cookieParser()); //for cookies

//main page
app.get("/", async (req, res) => {
    //main page, redirects user to authorization or sends them the home.html
    const token = req.cookies.token;

    if (token == undefined) {
        //redirect useres to login with spotify and authorize us to see their playback
        if (req.cookies.refresh == undefined) {
            //no refresh token, redirect to spotify site for auth
            console.log("HAVING USER AUTHORIZE WITH SPOTIFY");
            res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
                response_type: "code",
                client_id: process.env.CLIENT_ID,
                redirect_uri: "http://localhost:3000/callback",
                scope: "user-read-playback-state"
            }
            ));
        } else {
            //can use refresh token
            console.log("GOING TO USE ACCESS TOKEN");
            get_another_token(req, res); //will get a new access token and bring us back here
        }
    } else {
        await store_song_data(req, res);
        res.sendFile(__dirname + "/home.html");
    }
})

//front end files
app.get("/style.css", (req, res) => {
    res.sendFile(__dirname + "/style.css");
})

app.get("/script.js", (req, res) => {
    res.sendFile(__dirname + "/script.js");
})

app.get("/res/black.jpg", (req, res) => {
    res.sendFile(__dirname + "/res/black.jpg");
})

//handling get requests after user login
app.get("/callback", async (req, res) => {

    //get code from login
    const code = req.query.code || null;

    if (code) { //authorized
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
                redirect_uri: "http://localhost:3000/callback"
            })
        })
        let token_data = await data.json();
        const token = token_data["access_token"];
        const refresh = token_data["refresh_token"];
        const expires_in = token_data["expires_in"];
        
        //cookies
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
    } else {
        //user hit cancel
        res.redirect("https://www.youtube.com/watch?v=D2_r4q2imnQ"); //troll them
    }
})

async function get_another_token(req, res) {
    //uses refresh token to set new access token
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
    } else {
        const token = refresh_data["access_token"];
        const expires_in = refresh_data["expires_in"];
    
        //setting new token
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: expires_in*1000 // 1 hour typically (1k for mili)
        });
    }
    //refresh page
    res.redirect("/");
}

async function get_song_data(req, res) {
    //returns song data by calling spotify api
    let song_name;
    let song_artist;
    let song_image;

    const token = req.cookies.token;
    const cur_data = await fetch("https://api.spotify.com/v1/me/player", {headers: {Authorization: `Bearer ${token}`}}); //using our access token

    if (cur_data.statusText != "No Content") {
        const song_data_json = await cur_data.json();
        if (song_data_json["item"] != undefined) {
            song_name = song_data_json["item"]["name"];
            song_artist = song_data_json["item"]["artists"][0]["name"];
            if (song_data_json["item"]["album"]["images"].length > 0) {
                //local files can have no photo
                song_image = song_data_json["item"]["album"]["images"][0]["url"];
            }
    
            console.log(song_name + " by, " + song_artist);
        
            
            return genius_search_result(song_name, song_artist, song_image);
        } else {
            console.log("CANNOT GET ITEM")
            return false;
        }
    } else {
        console.log("NO ACTIVE SESSION")
        return false;
    }
}

async function genius_search_result(song_name, song_artist, song_image) {
    //uses genius api to search for the best fitting song and add its url to object to be returned

    const regex1 = /\(.*?\)|\[.*?\]/g; //removes all parenthesis and brackets
    const regex2 = / - .*$/; //for - Remastered (removes dash and all after)
    let formatted_name = song_name.replace(regex1, "").replace(regex2, "");

    let genius_response = await fetch("https://api.genius.com/search?q=" + formatted_name + " " + song_artist, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
    let genius_json = await genius_response.json();

    let hits = genius_json["response"]["hits"];
    let genius_url = undefined;

    genius_url = get_best_hit(hits, formatted_name, song_artist);

    //if still undefined remove artist and try again with just title
    if (genius_url == undefined) {
        genius_response = await fetch("https://api.genius.com/search?q=" + formatted_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
        genius_json = await genius_response.json();
        hits = genius_json["response"]["hits"];

        genius_url = get_best_hit(hits, formatted_name, song_artist);
    }

    return {"title": song_name, "artist": song_artist, "image": song_image, "url": genius_url};
}

function get_best_hit(hits, formatted_name, song_artist) {
    //takes in a list of hits from the genius api, uses a string similarity checker to select the best hit possible
    let genius_url = undefined;

    if (hits.length != 0) {
        const correct_full_title = formatted_name + " by " + song_artist;
        let best_match = 0.65; //needs atleast 65% similarity
        for (let i=0; i < hits.length; i++) {
            let cur_name = hits[i]["result"]["full_title"];
            let cur_match = stringSimilarity.compareTwoStrings(correct_full_title, cur_name);
            if (cur_match > best_match) {
                best_match = cur_match;
                genius_url = hits[i]["result"]["url"];
            }
        }
    }
    return genius_url;
}

async function store_song_data(req, res) {
    //get song data and put in cookies

    let data = await get_song_data(req, res);

    //set data in browsers cookies
    if (data) {
        res.cookie("title", data["title"]);
        res.cookie("artist", data["artist"]);
        res.cookie("image", data["image"])
        res.cookie("url", data["url"]);
    } else {
        console.log("FAILED TO STORE SONG DATA");
    }
}


//our api for front end
app.get("/api/lyrics", async (req, res) => {
    //scrapes the lyrics off of genius url in cookies
    let url = req.cookies.url;

    if (url != undefined && url != "undefined") { //string for cookies
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
    
        res.json({"lyrics": lyrics});
    } else {
        res.json({"lyrics": "Cannot Find Lyrics"});
    }

})

app.post("/api/analysis", async (req, res) => {
    //generates an analysis of the current selected lyrics
    let title = req.cookies.title;
    let artist = req.cookies.artist;

    if (title != undefined) {
        const to_prepend = `I am going to send you lines of lyrics from ${title} by ${artist}, please analyze each line in one to two sentences. Place the line before the analysis, Lyrics start now: \n`
        const lyrics = req.body.lyrics;
        const prompt = to_prepend + lyrics;
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
            if (chunk.candidates[0].finishReason == "OTHER") {
                res.write("\n### ERROR, cannot analyze specific slurs.");
                break;
            } else {
                res.write(chunk.text());
            }
        }
    } else {
        res.write("Please start a Spotify session.");
    }
    res.end();
})

app.post("/api/summary", async (req, res) => {
    //generates a summary of the current song using all lyrics
    let title = req.cookies.title;
    let artist = req.cookies.artist;

    if (title != undefined) {
        const lyrics = req.body.lyrics;
        let prompt;
        if (lyrics == "Cannot Find Lyrics") {
            prompt = `Write a summary about the song ${title}, by ${artist}.`;
        } else {
            prompt = `Write a summary about the song ${title}, by ${artist}. Here is a copy of the lyrics, ${lyrics}.`;
        }
    
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
            if ((chunk.promptFeedback != undefined && chunk.promptFeedback.blockReason == "OTHER") || chunk.candidates[0].finishReason == "OTHER") {
                res.write("\n### ERROR, cannot analyze specific slurs.");
                break;
            } else {
                res.write(chunk.text());
            }
        }
    } else {
        res.write("Please start a Spotify session.");
    }
    res.end();
})

app.post("/api/format", async (req, res) => {
    //formats the ai response using markdown
    const ai_text = req.body.ai_text;
    res.json({"formatted": md.render(ai_text)});
})

app.listen(3000, () => {console.log("SERVER STARTED");});