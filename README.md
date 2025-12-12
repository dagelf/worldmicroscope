Try out the proof of concept here: https://worldmicroscope.com

[![World Microscope Kaggle Entry](http://img.youtube.com/vi/2dMFwIy9S0Y/0.jpg)](https://youtu.be/2dMFwIy9S0Y)

Started as an entry to a Kaggle Gemini 3 vibecoding competition: https://www.kaggle.com/competitions/gemini-3

**Impact: Democratizing Science** Microscopy is often gated by expensive equipment and the need for specialized, siloed field-specific academic expertise. This application lowers those barriers by turning any standard USB camera into a high-end imaging device. It solves the real-world frustrations of narrow field of view and shallow depth of field, making scientific observation more accessible while enhancing higher end gear.

This project aspires to become the "Astrobin for Microbiology" - an interactive social standard for identifying, archiving, tagging and annotating the microscopic world. Unlike platforms like Zooniverse, which rely on users passively annotating institutional data, this project empowers anyone to generate, analyze and share their own data in a useful manner. The citizen science community, currently scattered across disjointed Discord channels and Twitch streams, could also finally have space for practical collaboration.

**The Solution** I used Google AI Studio to build a browser-based microscopy application that can serve as the core application of the envisioned platform. Using nothing but a standard USB microscope feed, the app performs real-time slide stitching, focus stacking, and 3D reconstruction, in the browser.

**How It Works** It dawned on me that the same computer vision principles used in autonomous driving could be applied here. Instead of relying on expensive hardware encoders for X/Y/Z positioning, machine learning can track movement and depth via the video feed alone and WebGL and shaders (a la shadertoy.com) can be used to accelerate processing, stitch images in the browser, and to even correct chromatic aberration from cheap lenses.

**The Process** This project was born half a day before the deadline while I was exploring a mold sample from my basement. Inspired by the knowledge of this competition, I realized that while I could see the sample, I lacked the tools to analyze it without an expensive lab. This platform can fill that void, combining AI-assisted identification with a social layer for enhancement and verification.

Understanding the pace of progress of AI, I suspected that Gemini would be able to build most of the platform with the right guidance, and when it one-shotted the UX and plausible focus stacking, I immediately knew that this was the perfect fit.

**Future Vision** The platform can be made modular, pluggable, even decentralized or embeddable like Disqus, it can allow users to share their data for better image recognition models, and while platforms like Zooniverse allow users to annotate institutional data, this platform can create an unsiloed home for millions of curious individuals exploring their own microscopic world as well as
