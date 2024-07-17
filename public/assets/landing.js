document.getElementById("search").addEventListener("click", find_song)
const inputs = document.getElementsByClassName("query")

for (let i=0; i < inputs.length; i++) {
    inputs[i].addEventListener("keydown", async (event) => {
        if (event.key == "Enter") {
            await find_song();
        }
    });
}

async function find_song() {
    document.getElementById("feedback").innerHTML = "Searching...";
    let title = document.getElementById("title").value;
    let artists = document.getElementById("artists").value;
    let res = await fetch(`/api/url?title=${encodeURIComponent(title)}&artists=${encodeURIComponent(artists)}`);
    let res_json = await res.json();
    if (res_json["title"] == null) {
        document.getElementById("feedback").innerHTML = "No lyrics found";
    } else {
        localStorage.setItem("title", res_json["title"]);
        localStorage.setItem("artists", res_json["artists"]);
        localStorage.setItem("url", res_json["url"]);
        localStorage.setItem("img", res_json["img"]);
        window.location.replace("/analysis.html");
    }
}