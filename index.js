require("dotenv").config();
const cookieParser = require('cookie-parser');
const express = require("express");
const querystring = require("querystring");

const app = express();
app.use(cookieParser());

//move these to the front end to be user specific

let song_name;
let song_artist;
let genius_url;
let genius_id;

//main page
app.get("/", async (req, res) => {
    //add login logic here, if no toke, redirect to login,
    //need to store token somewhere specific to user instead of one variable, once we set token once it never checks again
    const token = req.cookies.token;
    if (token == undefined) {
        console.log("going back to login, no token");
        res.redirect("/login");
    } else {
        await get_spotify_data(req, res, token);
        res.sendFile(__dirname + "/home.html");
    }
})

//getting genius embed script
app.get("/embed_script.js", async (req, res) => {
    const url = `https://genius.com/songs/${genius_id}/embed.js`;
    const res2 = await fetch(url);
    const script_text = await res2.text();

    res.send(script_text);
})

app.get("/script.js", (req, res) => {
    res.sendFile(__dirname + "/script.js");
})

//spotify login
app.get("/login", (req, res) => {

    //redirect useres to login with spotify and authorize us to see their playback
    res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
        response_type: "code",
        client_id: process.env.CLIENT_ID,
        redirect_uri: "http://localhost:3000/callback",
        scope: "user-read-playback-state"
    }
    ));

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
            sameSite: 'Strict',
            maxAge: 3600000 // 1 hour
        });

        //get song current info
        res.redirect("/");
    } else {
        //user hit cancel
        res.redirect("https://www.youtube.com/watch?v=D2_r4q2imnQ"); //troll them
    }
})

async function get_spotify_data(req, res, token) {
    //calls spotify api with our token, need to send this data to front end

    const cur_data = await fetch("https://api.spotify.com/v1/me/player", {headers: {Authorization: `Bearer ${token}`}}); //using our access token
    const song_data_json = await cur_data.json();

    song_name = song_data_json["item"]["name"];
    song_artist = song_data_json["item"]["artists"][0]["name"];

    console.log(song_name + " by, " + song_artist);

    //get genius url
    let genius_response = await fetch("https://api.genius.com/search?q=" + song_name + " " + song_artist, {headers: {Authorization: `Bearer ${process.env.GENIUS_ID}`}});
    let genius_json = await genius_response.json();
    //no search results
    if (genius_json["response"]["hits"].length == 0) {
        genius_response = await fetch("https://api.genius.com/search?q=" + song_name, {headers: {Authorization: `Bearer ${process.env.GENIUS_ID}`}});
        genius_json = await genius_response.json();
    }

    if (genius_json["response"]["hits"].length != 0) {
        genius_url = genius_json["response"]["hits"][0]["result"]["url"];
        genius_id = genius_json["response"]["hits"][0]["result"]["id"];
    }
}

app.get("/embed_data", (req, res) => {
    res.json({id: genius_id, url: genius_url, title: song_name, artist: song_artist});
});

app.listen(3000);