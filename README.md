# Lyric Analyzer

A site that aims to elevate the music listening experience. Ever wondered if there was a deeper meaning behind your favorite artists lyrics? This site delivers a easy way of analyzing them line by line!

# How It Works

- First the user arrives at a landing page where they can select a song of their choosing.
- Once the title and artists are given, the backend will make a call to the **Genius API**. This API responds with technical data like the url for the lyrics, url for the cover art, and the date it was released.
- With the url for the **lyrics**, I present them to the user on my site along with the cover art and meta data relating to the song.
- With the Lyrics secured, I use Google's **Gemini API** to make a call for a summary of the lyrics in their entirety. This summary is diplayed in the **Analysis Box**.
- Finally, the lyrics are selectable. This means the user can specify certain lines they want analyzed. Once the **Analysis** button is pressed, these lyrics are sent off to Gemini for an explanation.

# Tech Stack

I used **Node.js** and **Express** for the backend, and then plain **HTML**, **CSS**, and **JS** for the front end. See the package.json for more. The APIs I used are **Genius API** and the **Gemini API**.

# Spotify API

I have fully incorporated the **Spotify API** into this project, since this would get around the user needing to search a song. Sadly, Spotify has rejected my site from using their API to display lyrics. **"Synchronization: Spotify content is used in the background of visual media, such as lyrics We will therefore not be able to support your use case.**. This is a huge bummer, as I already coded the functionality. However, the code is still in the site for anyone wanting to see it.

# How to Use
Head over to https://lyric-analyzer.vercel.app/ to test it out!