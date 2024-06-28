//genius embed script
function set_thumbnail() {
    let cookies = document.cookie;
    let parsed = cookies.split("; ");
    let image;
    let title;
    let artist;

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
    //get artist
    for (let i=0; i < parsed.length; i++) {
        if (parsed[i].slice(0, 7) == "artist=") {
            artist = parsed[i].slice(7);
            break;
        }
    }

    if (image != undefined && title != undefined && artist != undefined) {
        let decoded_image = decodeURIComponent(image);
        let decoded_title = decodeURIComponent(title);
        let decoded_artist = decodeURIComponent(artist);
        document.getElementById("thumbnail").innerHTML = `<img src=${decoded_image}><h1>${decoded_title}</h1><h1>${decoded_artist}</h1>`
    }
}

async function check_update() {
    //refreshes browser if song has changed
    let same = await fetch("/api/check-update");
    let status = await same.json();

    let no_refresh = status["status"];
    if (!no_refresh) {
        location.reload();
    }
}

async function get_lyrics() {
    let res = await fetch("/api/lyrics")
    let data = await res.json();
    let lyrics = data["lyrics"];

    document.getElementById("lyrics").innerText = lyrics;
}

async function get_analysis(lyrics) {
    let res = await fetch("/api/analysis", {
        method: "POST",
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({"lyrics": lyrics})
    })
    let data = await res.json();
    let analysis = data["analysis"];

    document.getElementById("analysis").innerHTML = analysis;
}

//to do, add button with even listener, will use highlighted text to prompt ai

document.getElementById("analyze-button").addEventListener("click", () => {
    if (window.getSelection().toString().trim() != "") {
        lyrics = window.getSelection().toString();
        console.log(lyrics);
        get_analysis(lyrics);
    } else {
        document.getElementById("analysis").innerHTML = "No Selected Content";
    }
})

set_thumbnail();
get_lyrics();