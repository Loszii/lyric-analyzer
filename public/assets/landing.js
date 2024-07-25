async function find_song() {
    //function to get the current song data from the users input boxes, then a call to our backend attempting to redirect for analysis
    //if we can get the correct url for the lyrics we redirect to analysis.html, if not we update feedback box
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

async function find_song_spotify() {
    //wrapper for find_song and makes an extra api call to get the song data from an active spotify session and sets it to input
    //after the input is populated find_song() is automatically called
    let res = await fetch("/api/spotify");
    let res_json = await res.json();

    const redirect = res_json["redirect"];
    const title = res_json["title"];
    const artists = res_json["artists"];
    if (redirect != null) { //user must authorize
        window.location.href = redirect;
    } else if (title != null) {
        //song was found from spotify, set input vals
        document.getElementById("title").value = title;
        document.getElementById("artists").value = artists;
        await find_song();
    } else {
        document.getElementById("feedback").innerHTML = "No Spotify session found";
    }
}

async function main() {
    //main function to run when page is reloaded, checks if need to update inputs and adds event listeners
    //check if just connected to spotify and needs updating
    const search_params = new URLSearchParams(window.location.search);

    if (search_params.has("status")) {
        if (search_params.get("status") == "update") {
            find_song_spotify();
        } else if (search_params.get("status") == "error") {
            document.getElementById("feedback").innerHTML = "Error connecting to Spotify";
        }
        //remove param after handling
        const new_url = new URL(window.location);
        new_url.search = "";
        history.replaceState(null, null, new_url.toString());
    }
    
    
    document.getElementById("search").addEventListener("click", find_song)
    const inputs = document.getElementsByTagName("input")
    
    for (let i=0; i < inputs.length; i++) {
        inputs[i].addEventListener("keydown", async (event) => {
            if (event.key == "Enter") {
                await find_song();
            }
        });
    }
    
    //spotify button
    document.getElementById("spotify").addEventListener("click", find_song_spotify)
}

main();