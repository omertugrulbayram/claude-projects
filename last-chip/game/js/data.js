// Oyun içeriği: mekânlar, rakipler, şans eşyaları, evler, iş.
(function (LC) {
  const MAX_ITEMS = 3;

  const VENUES = [
    { id: 'rusty', name: 'Rusty Nail', blurb: 'Bir barın arka odası.', tier: 0, buyIn: 20, ante: 1, bets: [2, 4], rep: 0,
      pool: ['lenny', 'dottie', 'father_mike'], security: 0.5 },
    { id: 'alley', name: 'Back Alley', blurb: 'Çamaşırhanenin arkasında katlanır masa.', tier: 1, buyIn: 50, ante: 2, bets: [5, 10], rep: 0,
      pool: ['vinny', 'father_mike', 'dottie', 'big_k'], security: 0.8 },
    { id: 'rabbit', name: 'Lucky Rabbit', blurb: 'Gerçek bir casino. Halılar lekeli.', tier: 2, buyIn: 250, ante: 10, bets: [25, 50], rep: 8,
      pool: ['vinny', 'eleanor', 'big_k'], security: 1 },
    { id: 'crown', name: 'Royal Crown', blurb: 'Avizeler ve her birinde bir kamera.', tier: 3, buyIn: 2500, ante: 100, bets: [250, 500], rep: 25,
      pool: ['eleanor', 'duchess', 'mr_lee'], security: 1.5 },
    { id: 'ivory', name: 'The Ivory Room', blurb: 'Kapıda tabela yok. Davetlisin ya da değilsin.', tier: 4, buyIn: 25000, ante: 1000, bets: [2500, 5000], rep: 65,
      pool: ['duchess', 'mr_lee', 'mr_black'], security: 2 },
  ];

  // aggr: güçlü elde ne sıklıkla bahis açar. bluff: blöf oranı. tight: görmek için ne kadar güçlü el ister.
  const NPCS = {
    lenny: { name: 'Lenny', tag: 'Her şeyi görür.', aggr: 0.2, bluff: 0.05, tight: 0.1, tilt: 0.1,
      tells: { strong: 'Lenny kürdanı çiğnemeyi bıraktı.', weak: 'Lenny kürdanı hızlı hızlı çiğniyor.' } },
    dottie: { name: 'Dottie', tag: 'Çok çekilir, çok kazanır.', aggr: 0.3, bluff: 0.02, tight: 0.7, tilt: 0,
      tells: { strong: 'Dottie çantasını okşuyor.', weak: 'Dottie kartlarına iç çekiyor.' } },
    father_mike: { name: 'Peder Mike', tag: 'Kilisenin çatısı için oynuyormuş.', aggr: 0.5, bluff: 0.12, tight: 0.5, tilt: 0.3,
      tells: { strong: 'Peder Mike haç çıkarıyor.', weak: 'Peder Mike tavana bakıyor.' } },
    vinny: { name: 'Vinny', tag: 'Büyük oynar, kaybedince tilt olur.', aggr: 0.85, bluff: 0.3, tight: 0.2, tilt: 1,
      tells: { strong: 'Vinny birden sustu.', weak: 'Vinny kuzeninden bahsetmeye başladı.' } },
    big_k: { name: 'Big K', tag: 'Kamyoncu. Sürdüğü gibi oynar.', aggr: 0.6, bluff: 0.15, tight: 0.4, tilt: 0.5,
      tells: { strong: 'Big K arkasına yaslandı.', weak: 'Big K masada parmaklarını tıkırdatıyor.' } },
    eleanor: { name: 'Eleanor', tag: 'Neredeyse hiç blöf yapmaz. Neredeyse.', aggr: 0.4, bluff: 0.03, tight: 0.8, tilt: 0, bigBluff: true,
      tells: { strong: 'Eleanor incilerini düzeltiyor.', weak: 'Eleanor hiçbir şey yapmıyor.' } },
    duchess: { name: 'Düşes', tag: 'Eski para. Eğlencesine oynar.', aggr: 0.6, bluff: 0.18, tight: 0.6, tilt: 0.2,
      tells: { strong: 'Düşes gözleriyle gülümsüyor.', weak: 'Düşes saatine bakıyor.' } },
    mr_lee: { name: 'Bay Lee', tag: 'Seni menü gibi okur.', aggr: 0.55, bluff: 0.1, tight: 0.65, tilt: 0, reads: true,
      tells: { strong: 'Bay Lee fişlerini düzgünce diziyor.', weak: 'Bay Lee fişlerini düzgünce diziyor.' } },
    mr_black: { name: 'Mr. Black', tag: 'Borçlu olduğun adam.', aggr: 0.65, bluff: 0.15, tight: 0.6, tilt: 0, reads: true,
      tells: { strong: 'Mr. Black yüzüğünü masaya vuruyor.', weak: 'Mr. Black sigara yakıyor.' } },
    zero: { name: 'ZERO', tag: 'Kim olduğunu kimse bilmiyor.', aggr: 0.7, bluff: 0.25, tight: 0.55, tilt: 0, patBluff: true,
      tells: { strong: '...', weak: '...' } },
  };

  // heat: her elde yakalanma ihtimali (mekânın güvenliğiyle çarpılır).
  const ITEMS = {
    dads_watch: { name: 'Babamın Saati', rarity: 'sıradan', price: 240, pawn: 120,
      desc: '+10 enerji. Satarsan $120 eder.' },
    bent_coin: { name: 'Eğri Bozuk Para', rarity: 'sıradan', price: 40,
      desc: 'Masadaki ilk kaybında %20 ihtimalle koyduğunun yarısı geri gelir.' },
    rabbit_foot: { name: 'Tavşan Ayağı', rarity: 'sıradan', price: 60,
      desc: 'Kart değiştirdikten sonra %12 ihtimalle en kötü kartın iyileşir.' },
    cheap_shades: { name: 'Ucuz Gözlük', rarity: 'sıradan', price: 35,
      desc: 'Rakibin tik\'lerini görürsün. 3 seferden 2\'sinde doğrudur.' },
    lucky_scarf: { name: 'Uğurlu Atkı', rarity: 'sıradan', price: 50,
      desc: 'Her elde %25 ihtimalle ante\'yi kasa öder.' },
    last_cigarette: { name: 'Son Sigara', rarity: 'nadir', price: 120,
      desc: 'Fişlerin azken Kent veya daha iyisiyle kazanırsan x2.5. %25 ihtimalle yanıp biter.' },
    gold_chain: { name: 'Altın Zincir', rarity: 'nadir', price: 400,
      desc: 'Rakipler bahislerine daha sık çekilir.' },
    fedora: { name: 'Gri Fötr', rarity: 'nadir', price: 260,
      desc: 'Kazandığında +%50 itibar.' },
    dead_mans_ring: { name: 'Ölü Adamın Yüzüğü', rarity: 'efsane', price: 900,
      desc: 'Üst üste 3 el kaybedersen sonraki elde sana maça gelir.' },
    loaded_dice: { name: 'Hileli Zar', rarity: 'kaçak', price: 300, heat: 0.008,
      desc: 'Bütün şans eşyalarının ihtimali +%15. Güvenlik fark edebilir.' },
    marked_cards: { name: 'İşaretli Kartlar', rarity: 'kaçak', price: 450, heat: 0.015,
      desc: 'Her elde rakibin bir kartını görürsün. Güvenlik fark edebilir.' },
    black_joker: { name: 'Kara Joker', rarity: 'eşsiz', price: 0, pawn: 5000,
      desc: 'Elindeki bir kart her zaman joker sayılır. Zero bıraktı.' },
  };

  const SHOP_POOL = Object.keys(ITEMS).filter((k) => !['dads_watch', 'black_joker'].includes(k));

  // Kira 4 günde bir alınır.
  const HOUSING = {
    street: { name: 'Sokak', rent: 0, deposit: 0, energy: -30, scene: 'street' },
    motel: { name: 'Starlite Motel', rent: 35, deposit: 0, energy: 0, scene: 'motel' },
    apartment: { name: 'Ucuz Daire', rent: 20, deposit: 800, energy: 10, scene: 'apartment', perk: '+10 enerji' },
    loft: { name: 'Şehir Merkezi Loft', rent: 90, deposit: 12000, energy: 20, rep: 10, scene: 'loft', perk: '+20 enerji, +10 itibar' },
    penthouse: { name: 'Penthouse', rent: 350, deposit: 140000, energy: 30, repDiscount: 15, scene: 'loft', perk: '+30 enerji, casino itibar şartı -15' },
  };
  const HOUSING_ORDER = ['motel', 'apartment', 'loft', 'penthouse'];

  const JOB = { name: 'Benzinlik', pay: 48, energy: 40, raiseEvery: 10, raise: 6, maxBonus: 36 };
  const HAND_ENERGY = 4;

  LC.data = { MAX_ITEMS, VENUES, NPCS, ITEMS, SHOP_POOL, HOUSING, HOUSING_ORDER, JOB, HAND_ENERGY };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
