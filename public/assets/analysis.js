let title;
let artists;
let url;
let img;

function get_data() {
    //searches cookies for information relating to the thumbnail
    title = localStorage.getItem("title");
    artists = localStorage.getItem("artists");
    url = localStorage.getItem("url");
    img = localStorage.getItem("img");

    if (img == "undefined") {
        img = "/res/black.jpg";
    }

    return {"title": title, "artists": artists, "url": url, "img": img};

}

async function get_lyrics() {
    //gets the lyrics from backend
    const res = await fetch(`/api/lyrics?url=${encodeURIComponent(url)}`)
    const lyrics = await res.text();

    document.getElementById("lyrics").innerText = lyrics;
}

async function get_analysis(lyrics) {
    //analyzes highlighted lyrics and writes to analysis div
    const container = document.getElementById("analysis");
    container.innerHTML = "LOADING...";

    const res = await fetch(`/api/analyze?title=${title}&artists=${artists}`, {
        method: "POST",
        headers: {'Content-Type': 'text/plain'},
        body: lyrics
    })
    const data = await res.text();

    container.innerHTML = data;

}

async function get_summary() {
    //gets the summary of song and writes to analysis div
    const res = await fetch(`/api/summary?title=${title}&artists=${artists}`, {
        method: "POST",
        headers: {'Content-Type': 'text/plain'},
        body: document.getElementById("lyrics").innerHTML
    })
    const data = await res.text();

    document.getElementById("analysis").innerHTML = data;
}

document.getElementById("analyze-button").addEventListener("click", () => {
    //send the currently highlighted text to backend for analysis
    if (window.getSelection().toString().trim() != "") {
        lyrics = window.getSelection().toString();
        get_analysis(lyrics);
    } else {
        document.getElementById("analysis").innerHTML = "No Selected Content";
    }
})

async function main() {
    const {title, artists, url, img} = get_data();
    document.getElementById("thumbnail").innerHTML = `<img src=${img}><h1>${title}</h1><h1>${artists}</h1>`;

    await get_lyrics();
    get_summary();
}

main();