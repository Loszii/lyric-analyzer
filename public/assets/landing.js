document.getElementById("search").addEventListener("click", async () => {
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
})