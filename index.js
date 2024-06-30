require("dotenv").config();
const cookieParser = require('cookie-parser');
const express = require("express");
const querystring = require("querystring");
const { JSDOM } = require("jsdom");
const { HarmBlockThreshold, HarmCategory, GoogleGenerativeAI } = require("@google/generative-ai");
const markdownIt = require("markdown-it");

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
        console.log("HAVING USER AUTHORIZE WITH SPOTIFY");
        //redirect useres to login with spotify and authorize us to see their playback
        res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
            response_type: "code",
            client_id: process.env.CLIENT_ID,
            redirect_uri: "http://localhost:3000/callback",
            scope: "user-read-playback-state"
        }
        ));
    } else {
        await store_song_data(req, res);
        res.sendFile(__dirname + "/home.html");
    }
})

app.get("/style.css", (req, res) => {
    res.sendFile(__dirname + "/style.css");
})


app.get("/script.js", (req, res) => {
    res.sendFile(__dirname + "/script.js");
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
        
        //cookies
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            maxAge: 3600000 // 1 hour
        });

        //get song current info
        res.redirect("/");
    } else {
        //user hit cancel
        res.redirect("https://www.youtube.com/watch?v=D2_r4q2imnQ"); //troll them
    }
})

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
            song_image = song_data_json["item"]["album"]["images"][0]["url"];
    
            console.log(song_name + " by, " + song_artist);
        
            
            return genius_search_result(req, res, song_name, song_artist, song_image);
        } else {
            console.log("CANNOT GET ITEM")
            return false;
        }
    } else {
        console.log("NO ACTIVE SESSION")
        return false;
    }
}

async function genius_search_result(req, res, song_name, song_artist, song_image) {
    //uses genius api to search for the best fitting song and add its url to object to be returned

    let genius_response = await fetch("https://api.genius.com/search?q=" + song_name + " " + song_artist, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
    let genius_json = await genius_response.json();
    let genius_url;

    //getting best search result
    if (genius_json["response"]["hits"].length == 0) {
        genius_response = await fetch("https://api.genius.com/search?q=" + song_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
        genius_json = await genius_response.json();
    }

    if (genius_json["response"]["hits"].length != 0) {
        genius_url = genius_json["response"]["hits"][0]["result"]["url"];
    }

    return {"title": song_name, "artist": song_artist, "image": song_image, "url": genius_url};
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
        res.cookie("title", undefined);
    }
}

app.get("/api/lyrics", async (req, res) => {
    //scrapes the lyrics off of genius url in cookies
    let url = decodeURIComponent(req.cookies.url);
    console.log(url);

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
})

app.post("/api/analysis", async (req, res) => {
    //generates an analysis of the current selected lyrics
    let title = req.cookies.title;
    let artist = req.cookies.artist;

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
    res.end();
})

app.post("/api/summary", async (req, res) => {
    //generates a summary of the current song using all lyrics
    let title = req.cookies.title;
    let artist = req.cookies.artist;
    const lyrics = req.body.lyrics;
    const prompt = `Write a summary about the song ${title}, by ${artist}. Here is a copy of the lyrics, ${lyrics}.`;

    const result = await model.generateContentStream(prompt);
    for await (const chunk of result.stream) {
        if (chunk.candidates[0].finishReason == "OTHER") {
            res.write("\n### ERROR, cannot analyze specific slurs.");
            break;
        } else {
            res.write(chunk.text());
        }
    }
    res.end();

})

app.post("/api/format", async (req, res) => {
    //formats the ai response using markdown
    const ai_text = req.body.ai_text;
    res.json({"formatted": md.render(ai_text)});
})

app.listen(3000);