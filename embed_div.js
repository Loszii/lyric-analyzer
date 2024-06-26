let cookies = document.cookie;
let parsed = cookies.split("; ");
let id;
//get genius id from cookies
for (let i=0; i < parsed.length; i++) {
    if (parsed[i].slice(0, 3) == "id=") {
        id = parsed[i].slice(3);
        break;
    }
}

//make div for genius embed lyrics
if (id != undefined) {
    document.getElementById("embed").innerHTML = `<div id="rg_embed_link_${id}" class="rg_embed_link" data-song-id="${id}"></div>`;
}