
const giftImages = Array.from({ length: 38 }, (_, index) => {
  const number = index + 1;
  const filename = `presente (${number}).jpeg`;

  return {
    name: `Foto ${number}`,
    url: `./presentes/${encodeURIComponent(filename)}`
  };
});

export default giftImages;
