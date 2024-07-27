function get_data() {
    //get data that landing.js has set into local storage
    let title = localStorage.getItem("title");
    let artists = localStorage.getItem("artists");
    let url = localStorage.getItem("url");
    let img = localStorage.getItem("img");
    let date = localStorage.getItem("date");

    if (img == "undefined") {
        img = "/res/black.jpg";
    }

    return {"title": title, "artists": artists, "url": url, "img": img, "date": date};

}

async function get_lyrics(url) {
    //gets the lyrics from backend
    const res = await fetch(`/api/lyrics?url=${encodeURIComponent(url)}`)
    const lyrics = await res.text();
    const seperated = lyrics.split('\n');
    let inner_html = "";
    for (let i=0; i < seperated.length; i++) {
        inner_html += "<div class=\"lyric-line\">" + seperated[i] + "</div>";
    }
    document.getElementById("lyrics").innerHTML = inner_html;
    return inner_html;
}

async function get_summary(title, artists) {
    //gets the summary of song and writes to analysis div
    const res = await fetch(`/api/summary?title=${title}&artists=${artists}`, {
        method: "POST",
        headers: {'Content-Type': 'text/plain'},
        body: document.getElementById("lyrics").innerText
    })
    const data = await res.text();

    document.getElementById("analysis").innerHTML = data;
    return data;
}

async function get_analysis(title, artists, lyrics) {
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

async function main() {
    //main code to run everytime this page is loaded
    const {title, artists, url, img, date} = get_data();
    document.getElementById("thumbnail").innerHTML = `<img src=${img}><h1>${title}</h1><h1>${artists}</h1><h1>${date}</h1>`;

    if (localStorage.getItem("cur") != url) {
        //need to get new api data
        const lyrics = await get_lyrics(url);
        const summary = await get_summary(title, artists);
        localStorage.setItem("cur", url);
        localStorage.setItem("lyrics", lyrics);
        localStorage.setItem("summary", summary);
    } else {
        //get from last local storage dump
        document.getElementById("lyrics").innerHTML = localStorage.getItem("lyrics");
        document.getElementById("analysis").innerHTML = localStorage.getItem("summary");
    }

    //adding ability to change background of lines with a click
    const lyric_lines = document.getElementsByClassName("lyric-line");
    for (let i=0; i < lyric_lines.length; i++) {
        lyric_lines[i].addEventListener("click", () => {
            if (lyric_lines[i].style.backgroundColor == "white") {
                lyric_lines[i].style = "background-color: transparent; color: white;";
            } else {
                lyric_lines[i].style = "background-color: white; color: black;";
            }
        });
    }

    //lines with white background are analyzed when using button
    let cooldown = false;
    document.getElementById("analyze-button").addEventListener("click", async () => {
        //send the currently selected text to backend for analysis
        let lyrics = "";
        for (let i=0; i < lyric_lines.length; i++) {
            if (lyric_lines[i].style.backgroundColor == "white") {
                lyrics += lyric_lines[i].innerText + '\n';
            }
        }

        if (lyrics == "") {
            document.getElementById("analysis").innerHTML = "No Selected Content";
        } else if (cooldown) {
            document.getElementById("analysis").innerHTML = "Please Wait 3 Seconds Between Analysis";
        } else {
            //put on cooldown and get analysis
            cooldown = true;
            await get_analysis(title, artists, lyrics);
            setTimeout(() => {cooldown = false;}, 3000);
        }
    })

    //deselect button
    document.getElementById("deselect").addEventListener("click", () => {
        for (let i=0; i < lyric_lines.length; i++) {
            lyric_lines[i].style.backgroundColor = "transparent";
            lyric_lines[i].style.color = "white";
        }
    })
}

main();