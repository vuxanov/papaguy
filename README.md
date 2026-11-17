# Papaguy

[Open Papaguy in your browser](https://vuxanov.github.io/papaguy/). Allow camera access to control the macaw. Tracking runs locally in the browser.

Open `dist/Papaguy.html` directly in Chrome or Brave. Papaguy requests camera access when it opens. The camera, graphics and tracking work offline.

Raise, reach or bend either arm to move the corresponding wing. Reach forward or cross your hands to bring a wing across the face. Bend your elbows to fold the outer wings. Rotate your palms to roll the wings, and spread your fingers with palms forward to fan the trailing feathers. The tips follow the curl and spread of each tracked finger. The bird follows body turns, shifts and head movements. Opening your mouth opens the beak. Put the camera where it can see your face and both arms.

Choose **Fullscreen** to hide the controls and camera preview. Press Escape, double-click the stage, or double-tap on a touchscreen to return.

## Rebuild after source changes

```sh
npm ci
npm run build
```

The build writes `dist/Papaguy.html`. The character is a public-domain macaw adapted with articulated wings, head and beak. [Character source](https://grab3d.com/models/animals/parrot/) · [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
