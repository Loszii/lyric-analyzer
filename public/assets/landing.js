document.getElementById("search").addEventListener("click", find_song)
const inputs = document.getElementsByClassName("query")

for (let i=0; i < inputs.length; i++) {
    inputs[i].addEventListener("keydown", async (event) => {
        if (event.key == "Enter") {
            await find_song();
        }
    });
}

//spotify button
document.getElementById("spotify").addEventListener("click", async () => {
    //make api call to get the url and then redirect them
    let res = await fetch("/api/spotify");
    let res_json = await res.json();
    console.log(res);
    const redirect = res_json["redirect"];
    const title = res_json["title"];
    const artists = res_json["artists"];
    if (redirect != null) { //user must authorize
        window.location.href = redirect;
    } else if (title != null) {
        document.getElementById("title").value = title;
        document.getElementById("artists").value = artists;
        await find_song();
    } else {
        document.getElementById("feedback").innerHTML = "No Spotify session found";
    }
})

async function find_song() {
    document.getElementById("feedback").innerHTML = "Searching...";
    let title = document.getElementById("title").value;
    let artists = document.getElementById("artists").value;
    let res = await fetch(`/api/data?title=${encodeURIComponent(title)}&artists=${encodeURIComponent(artists)}`);
    let res_json = await res.json();
    if (res_json["title"] == null) {
        document.getElementById("feedback").innerHTML = "No lyrics found";
    } else {
        localStorage.setItem("title", res_json["title"]);
        localStorage.setItem("artists", res_json["artists"]);
        localStorage.setItem("url", res_json["url"]);
        localStorage.setItem("img", res_json["img"]);
        localStorage.setItem("date", res_json["date"]);
        window.location.replace("/analysis.html");
    }
}