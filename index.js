require("dotenv").config();
const express = require("express");
const querystring = require("querystring");

const app = express();

let token;

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/home.html");
})

app.get("/login", (req, res) => {

    res.redirect("https://accounts.spotify.com/authorize?" + querystring.stringify({
        response_type: "code",
        client_id: process.env.CLIENT_ID,
        redirect_uri: "http://localhost:3000/callback",
        scope: "user-read-playback-state"
    }
    ));

})

app.get("/callback", async (req, res) => {
    const code = req.query.code || null;

    if (code) {
        const data = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "Authorization": "Basic " + (new Buffer.from(process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET).toString("base64")) //converting to base64
            },
            body: new URLSearchParams({ //urlSearcParams encodes in content-type
                grant_type: "authorization_code",
                code: code,
                redirect_uri: "http://localhost:3000/callback"
            })
        })
        let token_data = await data.json();
        token = token_data["access_token"];
        
        const cur_data = await fetch("https://api.spotify.com/v1/me/player", {headers: {Authorization: `Bearer ${token}`}});
        const song_data_json = await cur_data.json();
        console.log(song_data_json["item"]["name"] + " by, " + song_data_json["item"]["artists"][0]["name"] + "\n");

        res.redirect("/");
    }
})

app.listen(3000);