require("dotenv").config();
const cookieParser = require("cookie-parser");
const express = require("express");
const querystring = require("querystring");
const { JSDOM } = require("jsdom");
const { HarmBlockThreshold, HarmCategory, GoogleGenerativeAI } = require("@google/generative-ai");
const markdownIt = require("markdown-it");
const stringSimilarity = require("string-similarity");
const favicon = require("serve-favicon");

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
    spotify_redirect_uri = "https://lyric-analyzer.vercel.app";
}

//setting up app
const app = express();
app.use(express.json()); //for parsing body
app.use(cookieParser()); //for cookies

//static files
app.use("/res", express.static(__dirname + "/res"));
app.use("/assets", express.static(__dirname + "/assets"));
//icon
app.use(favicon(__dirname + "/res/favicon.png"));

//main page
app.get("/", async (req, res) => {
    //main page, redirects user to authorization or sends them the home.html
    const token = req.cookies.token;

    if (token == undefined) {
        //redirect useres to login with spotify and authorize us to see their playback
        if (req.cookies.refresh == undefined) {
            //no refresh token, redirect to spotify site for auth
            console.log("Having user authorize with Spotify");
            res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
                response_type: "code",
                client_id: process.env.CLIENT_ID,
                redirect_uri: spotify_redirect_uri,
                scope: "user-read-playback-state"
            }
            ));
        } else {
            //can use refresh token
            console.log("Going to use refresh token");
            get_another_token(req, res); //will get a new access token and bring us back here
        }
    } else {
        //get the song data
        let data = await get_song_data(req, res); //returns false if error
        
        if (data) {
            const {title, artists, image} = data;
            const url = await genius_search_result(title, artists); //get the genius url

            //set data in browsers cookies
            res.cookie("title", title);
            res.cookie("artists", artists);
            res.cookie("image", image)
            res.cookie("url", url);
        } else {
            console.log("FAILED TO STORE SONG DATA");
        }
        
        //send home with the correct cookies in browser, here the html will make requests for lyrics/analysis
        res.sendFile(__dirname + "/pages/home.html");
    }
})

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
            res.sendFile(__dirname + "/pages/error.html");
        }
    } else {
        //user hit cancel
        const error = req.query.error || "Unkown error";
        console.log("Error in Spotify authorization:", error);
        res.sendFile(__dirname + "/pages/error.html");
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
    try {
        let song_name;
        let song_artists = [];
        let song_image = undefined; //in case it is local and doesn't have one
    
        const token = req.cookies.token;
        const cur_data = await fetch("https://api.spotify.com/v1/me/player", {headers: {Authorization: `Bearer ${token}`}}); //using our access token
    
        const song_data_json = await cur_data.json();
        song_name = song_data_json["item"]["name"];
    
        //append artists to song_artists
        for (let i=0; i < song_data_json["item"]["artists"].length; i++) {
            song_artists.push(song_data_json["item"]["artists"][i]["name"]);
        }
        song_artists = song_artists.join(", "); //make string of artists
    
        if (song_data_json["item"]["album"]["images"].length > 0) {
            song_image = song_data_json["item"]["album"]["images"][0]["url"]; //0 is best quality version
        }        
        
        return {"title": song_name, "artists": song_artists, "image": song_image};
    } catch (err) {
        console.log("Failed to get song data:", err.message);
        return false;
    }
}

async function genius_search_result(song_name, song_artists) {
    //uses genius api to search for the best fitting song and add its url to object to be returned
    //if cannot find url, just returns an object with the given params and url: undefined
    try {
        const regex1 = /\(.*?\)|\[.*?\]/g; //removes all parenthesis and brackets
        const regex2 = / - .*$/; //for - Remastered (removes dash and all after)
        let formatted_name = song_name.replace(regex1, "").replace(regex2, "").trim();
        let correct_title = formatted_name + " by " + song_artists;
        console.log("Current song is:", correct_title);
    
        //search without the "by " for better results
        let encoded_name = encodeURIComponent(formatted_name + " " + song_artists); //to convert special characters that could mess up call
        let genius_response = await fetch("https://api.genius.com/search?q=" + encoded_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
        let genius_json = await genius_response.json();
    
        let hits = genius_json["response"]["hits"];
        let genius_url = undefined;
        
        genius_url = get_best_hit(hits, correct_title, 0.70);
    
        //if still undefined remove artist and try again with just title
        if (genius_url == undefined) {
            encoded_name = encodeURIComponent(formatted_name)
            genius_response = await fetch("https://api.genius.com/search?q=" + encoded_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_KEY}`}});
            genius_json = await genius_response.json();
            hits = genius_json["response"]["hits"];
    
            genius_url = get_best_hit(hits, correct_title, 0.40); //lowering threshold
        }
        
        //may still be undefined but return anyway
        return genius_url;
    } catch (err) {
        console.log("Error in genius seach result:", err.message);
        return undefined;
    }
}

function get_best_hit(hits, correct_title, threshold) {
    //takes in a list of hits from the genius api, uses a string similarity checker to select the best hit possible
    let genius_url = undefined;

    let best_match = threshold; //needs atleast threshold% similarity
    for (let i=0; i < hits.length; i++) {
        try {
            let cur_name = hits[i]["result"]["full_title"];
            let cur_match = stringSimilarity.compareTwoStrings(correct_title.toLowerCase(), cur_name.toLowerCase());
            
            console.log("LOOKING FOR", correct_title, "CURRENT SEARCH:", cur_name, "CURRENT MATCH:", cur_match);

            if (cur_match > best_match) {
                best_match = cur_match;
                genius_url = hits[i]["result"]["url"];
            }
        } catch (err) {
            console.log("Error in get best hit:", err.message);
        }
    }
    return genius_url;
}

//our api for front end
app.get("/api/lyrics", async (req, res) => {
    //scrapes the lyrics off of genius url in cookies
    let url = req.cookies.url;

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
        res.json({"lyrics": lyrics});
    } catch (err) {
        console.log("Error in fetching song lyrics:", err.message);
        res.json({"lyrics": "Cannot Find Lyrics"});
    }

})

app.post("/api/analysis", async (req, res) => {
    //generates an analysis of the current selected lyrics
    let title = req.cookies.title;
    let artists = req.cookies.artists;

    if (title != undefined) {
        try {
            const to_prepend = `I am going to send you lines of lyrics from ${title} by ${artists}, please analyze each line in one to two sentences. Place the line before the analysis, Lyrics start now: \n`
            const lyrics = req.body.lyrics;
            const prompt = to_prepend + lyrics;
            const result = await model.generateContentStream(prompt);
            for await (const chunk of result.stream) {
                if ((chunk.promptFeedback != undefined && chunk.promptFeedback.blockReason == "OTHER") || chunk.candidates[0].finishReason == "OTHER") {
                    //slurs like the n word will lead to the AI finishing
                    res.write("\n### ERROR, cannot analyze specific slurs.");
                    break;
                } else {
                    res.write(chunk.text());
                }
            }
        } catch (err) {
            console.log("Error in analysis:", err.message);
            res.write("\n### ERROR");
        }
    } else {
        res.write("Please start a Spotify session.");
    }
    res.end();
})

app.post("/api/summary", async (req, res) => {
    //generates a summary of the current song using all lyrics
    let title = req.cookies.title;
    let artists = req.cookies.artists;
    const lyrics = req.body.lyrics;
    if (lyrics == "Cannot Find Lyrics" || lyrics == "") {
        res.write("Without the lyrics I am unable to analyze the current song.");
    } else if (title != undefined) {
        try {
            let prompt = `Write a summary about the song ${title}, by ${artists}. Here is a copy of the lyrics, ${lyrics}.`;
        
            const result = await model.generateContentStream(prompt);
            for await (const chunk of result.stream) {
                if ((chunk.promptFeedback != undefined && chunk.promptFeedback.blockReason == "OTHER") || chunk.candidates[0].finishReason == "OTHER") {
                    res.write("\n### ERROR, cannot analyze specific slurs.");
                    break;
                } else {
                    res.write(chunk.text());
                }
            }
        } catch (err) {
            console.log("Error in summary:", err.message);
            res.write("\n### ERROR");
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

const port = process.env.PORT || 3000;
app.listen(port, () => {console.log("SERVER STARTED ON PORT", port);});