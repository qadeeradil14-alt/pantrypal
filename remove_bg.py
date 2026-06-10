from PIL import Image
import glob
import os

files = glob.glob('apps/stokit-v2/assets/custom-emojis/*.png')

for file in files:
    img = Image.open(file)
    img = img.convert("RGBA")
    datas = img.getdata()

    newData = []
    # threshold for "white"
    for item in datas:
        # If it's close to pure white, make it transparent
        if item[0] > 230 and item[1] > 230 and item[2] > 230:
            # We can do a smooth alpha blend if needed, but a sharp cutoff is fine for now
            # Actually, to avoid white halos, let's just make it fully transparent
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(file, "PNG")
    print(f"Processed {file}")
