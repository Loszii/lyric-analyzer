function set_thumbnail() {
    //searches cookies for information relating to the thumbnail
    const cookies = document.cookie;
    const parsed = cookies.split("; ");
    let image;
    let title;
    let artists;

    //get image url
    for (let i=0; i < parsed.length; i++) {
        if (parsed[i].slice(0, 6) == "image=") {
            image = parsed[i].slice(6);
            break;
        }
    }
    //get title
    for (let i=0; i < parsed.length; i++) {
        if (parsed[i].slice(0, 6) == "title=") {
            title = parsed[i].slice(6);
            break;
        }
    }
    //get artists
    for (let i=0; i < parsed.length; i++) {
        if (parsed[i].slice(0, 8) == "artists=") {
            artists = parsed[i].slice(8);
            break;
        }
    }

    if (image != undefined && title != undefined && artists != undefined) {
        let decoded_image = decodeURIComponent(image);
        if (decoded_image == "undefined") {
            decoded_image = "/res/black.jpg";
        }
        const decoded_title = decodeURIComponent(title);
        const decoded_artists = decodeURIComponent(artists);
        document.getElementById("thumbnail").innerHTML = `<img src=${decoded_image}><h1>${decoded_title}</h1><h1>${decoded_artists}</h1>`
    }
}

async function get_lyrics() {
    //gets the lyrics from backend
    const res = await fetch("/api/lyrics")
    const data = await res.json();
    const lyrics = data["lyrics"];

    document.getElementById("lyrics").innerText = lyrics;
}

async function get_analysis(lyrics) {
    //analyzes highlighted lyrics and writes to analysis div
    const container = document.getElementById("analysis");
    container.innerHTML = "LOADING...";

    const res = await fetch("/api/analysis", {
        method: "POST",
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({"lyrics": lyrics})
    })
    const data = await res.json();

    container.innerHTML = data["analysis"];

}

async function get_summary() {
    //gets the summary of song and writes to analysis div
    const res = await fetch("/api/summary", {
        method: "POST",
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({"lyrics": document.getElementById("lyrics").innerHTML})
    })
    const data = await res.json();

    document.getElementById("analysis").innerHTML = data["summary"];
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
    set_thumbnail();
    await get_lyrics();
    get_summary();
}

main();