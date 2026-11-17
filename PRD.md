# Papaguy product requirements

Draft for review · November 17, 2026

Papaguy is a browser-based 3D parrot puppeteered by a DJ during a live set. The audience sees a colorful feathered character framed chest-up against pure black, with the wings in view and the legs out of frame. The DJ lifts either arm to raise the corresponding wing and opens their mouth to open the beak. The character should read from across a venue and remain expressive while the DJ works at the mixer.

## First release

| Requirement | Acceptance check |
| --- | --- |
| A distinctive 3D parrot | A hooked beak, layered feathers and a readable wing silhouette are visible against black at rest and during a full raise. Use a few saturated color families, based on a realistic scarlet macaw, with feather and face details that read close up. Review on the intended stage display. |
| Independent wings | Raising one arm lifts its wing. Raising both lifts both. Intermediate positions produce intermediate poses, and lowering the arms folds the wings. The DJ confirms the left/right mapping during setup. |
| Articulated beak | Mouth opening drives the lower beak continuously. The beak settles closed at rest and during face tracking loss. Wing control continues during face loss. |
| Quick setup | Papaguy requests camera access at launch and responds as soon as the performer comes into view. |
| Clean show view | The canvas fills the performance viewport. A small Show button enters the clean view. Escape or double-tap returns to the button. |
| Graceful tracking loss | With an arm briefly hidden by equipment, the affected wing holds briefly and eases toward rest if tracking stays lost. Reacquisition blends in. Camera interruption leaves the parrot idling and offers recovery from setup. |
| Browser delivery | The first release targets a single offline HTML file opened in desktop Chrome or Brave on the rehearsal laptop. Test Android Chrome and iPhone Safari and document which device and browser combinations pass. Mobile support is desirable and is a separate acceptance decision. |

The first release covers one performer, one camera and one character. Body rotation and position, head rotation, and hand-driven wing spread reflect the performer’s movement. Later work can add audio-reactive feather colors or texture response and alternate backgrounds. The core performance requests camera access only.

## Performance and rehearsal

These are proposed targets to validate on actual hardware. Begin with a 30-minute desktop rehearsal using the intended camera, booth, lighting and display. Aim for a median of at least 55 rendered frames per second at 1080p on a 60 Hz reference display, and motion-to-display latency of at most 150 ms at the 95th percentile for wing and beak tests. Measure latency with high-frame-rate footage that shows the performer and performance display together. Try sustained 30 fps with usable tracking on phones and report thermal degradation.

Rehearse hands low at the mixer, unilateral and overhead arm raises, mouth changes, head turns, brief occlusion, re-entry, camera denial and camera disconnect. Set the camera roughly front-on with steady light on the face. Check that the mouth still tracks when the frame is wide enough for raised arms. Keep bystanders out of the tracking frame where practical and test a person crossing behind the DJ.

## Decisions to validate

- Confirm the rehearsal laptop, camera and projector or LED wall setup. Start with the browser canvas on the connected display.
- Approve the bird silhouette and palette with wings folded and fully raised before final modeling.
- Validate that one camera can reliably see arms and face in the real booth. Change distance, angle and lighting before assuming a model change will fix visibility.
- Choose the later audio source based on the venue workflow. A mixer feed via an audio interface and an ambient microphone are both candidates.

See [Technical architecture](ARCHITECTURE.md).
