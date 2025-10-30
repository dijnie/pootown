# Sound Files for Panda Monopoly

This directory contains all the sound effects and music for the game.

## Current Sound Files

### Existing Files
- ✅ `button-click.mp3` - Button click sound
- ✅ `dice-roll.mp3` - Dice rolling sound
- ✅ `dice-short.mp3` - Short dice roll sound
- ✅ `money-receive.mp3` - Money receive sound
- ✅ `property-buy.mp3` - Property purchase sound

### Required Additional Sound Files

#### UI Sounds
- `button-hover.mp3` - Button hover sound (subtle)
- `button-click2.mp3` - Alternative button click
- `dice-land.mp3` - Dice landing sound

#### Game Event Sounds
- `money-pay.mp3` - Money payment sound (different from receive)
- `rent-pay.mp3` - Rent payment sound (can be same as money-pay)
- `house-build.mp3` - House building sound (can be same as property-buy)
- `hotel-build.mp3` - Hotel building sound (can be same as property-buy)

#### Special Event Sounds
- `jail.mp3` - Going to jail sound
- `win.mp3` - Game win sound
- `lose.mp3` - Game lose sound

#### Fun Sounds (Optional)
- `anime-wow.mp3` - Anime wow sound
- `bruh.mp3` - Bruh sound effect
- `vine-boom.mp3` - Vine boom sound effect

#### Background Music
- `background-music.mp3` - Background music for gameplay (looping)

## Sound Implementation

### Features Implemented:
1. ✅ Separate volume controls for music and sound effects
2. ✅ Individual mute toggles for music and effects
3. ✅ Automatic sound playback on button clicks and hovers
4. ✅ Payment sounds (paying rent, buying property, receiving money)
5. ✅ Building sounds (building houses/hotels)
6. ✅ Background music with loop support
7. ✅ Sound control panel with expandable UI

### Where Sounds Are Used:
- **Button Click**: All UI buttons automatically play click sounds
- **Button Hover**: All UI buttons play subtle hover sounds
- **Money Receive**: Trade acceptance, selling buildings, passing GO
- **Money Pay**: Paying rent, taxes, jail fines, buying property
- **Property Buy**: Purchasing properties
- **House/Hotel Build**: Building improvements on properties
- **Dice Roll**: Rolling dice in game
- **Background Music**: Continuous gameplay music

### Volume Defaults:
- Background Music: 30%
- Sound Effects: 70%
- Individual sound volumes configured in `soundUtil.ts`

## How to Add New Sounds

1. Add the sound file to this directory (`/public/sounds/`)
2. Update `soundMap` in `/web/lib/soundUtil.ts`
3. Optionally add a helper function in `useSound` hook
4. Call the sound where needed in the game logic

## Sound Format

- Format: MP3
- Sample Rate: 44.1kHz recommended
- Bit Rate: 128kbps or higher
- Duration: Keep sound effects under 3 seconds for quick response
