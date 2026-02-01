import type { Family, FamilyStatus, PartialDate, Person, TreeDoc } from './model'
import { SCHEMA_VERSION, emptyView } from './model'
import credits from './sampleCredits.json'

// The sample family (PLAN X-2, TODO.md F5, F11): the Kapoor family of Hindi cinema, from Dewan
// Basheshwarnath Kapoor to Ranbir's generation, with Alia's family (the Bhatts, Emraan Hashmi's line
// among them) and Shweta's (the Bachchans). Facts come from each person's own Wikipedia article.
// When no source gives a birthday, one was made up from what is known (marriages, children, the
// generations around them) and saved as approximate, so the app says "about" (KP-3). Those are
// marked ~ below. Nobody under 18 is included (KP-2), and the notes are in our own words.
// Photos are freely licensed ones from Wikimedia Commons (scripts/build-sample-photos.mjs), shipped
// next to the app and saved to the browser when the sample opens. Everyone else keeps their leaf.

const ACTOR = 'Actor'
const DIRECTOR = 'Film director'
const PRODUCER = 'Film producer'
const THEATRE = 'Theatre'

type Extra = { maiden?: string; died?: string; diedIn?: string; notes?: string; tags?: string[] }

// [id, first name, last name, gender, born, birthplace, extra]. Dates are 'YYYY-MM-DD', 'YYYY-MM' or
// 'YYYY'. A leading ~ marks a made-up date. died: '?' means they've died but the date isn't known.
type Row = [id: string, first: string, last: string, gender: 'm' | 'f', born: string, place?: string, extra?: Extra]

const ROWS: Row[] = [
  ['basheshwarnath', 'Basheshwarnath', 'Kapoor', 'm', '~1880-06-15', undefined, { died: '?', notes: 'An officer in the Imperial Police in Peshawar. His son Prithviraj was the first of the family in films.' }],
  ['prithviraj', 'Prithviraj', 'Kapoor', 'm', '1906-11-03', 'Samundri, Punjab', { died: '1972-05-29', diedIn: 'Bombay, India', notes: 'Stage and film actor. Founded Prithvi Theatres in 1944, and played Emperor Akbar in Mughal-e-Azam (1960).', tags: [ACTOR, THEATRE] }],
  ['ramsarni', 'Ramsarni', 'Kapoor', 'f', '~1908-03-10', undefined, { maiden: 'Mehra', died: '?', notes: 'Married Prithviraj in 1923. Mother of Raj, Shammi and Shashi.' }],
  ['trilok', 'Trilok', 'Kapoor', 'm', '1912-02-11', 'Peshawar, British India', { died: '1988-09-23', diedIn: 'Bombay, India', notes: "Prithviraj's younger brother. An actor, often cast as Lord Shiva in mythological films.", tags: [ACTOR] }],

  ['raj', 'Raj', 'Kapoor', 'm', '1924-12-14', 'Peshawar, British India', { died: '1988-06-02', diedIn: 'New Delhi, India', notes: 'Actor and director, called the showman of Hindi cinema. Founded R. K. Films in 1948.', tags: [ACTOR, DIRECTOR, PRODUCER] }],
  ['krishna', 'Krishna', 'Kapoor', 'f', '1930-12-30', undefined, { maiden: 'Malhotra', died: '2018-10-01', diedIn: 'Mumbai, India', notes: 'Married Raj in 1946. Her brothers Prem Nath and Rajendra Nath were actors too.' }],
  ['shammi', 'Shammi', 'Kapoor', 'm', '1931-10-21', 'Bombay, India', { died: '2011-08-14', diedIn: 'Mumbai, India', notes: 'Actor, famous for his dancing and for shouting "Yahoo!" in Junglee (1961).', tags: [ACTOR] }],
  ['geeta', 'Geeta', 'Bali', 'f', '1930-11-30', 'Amritsar, India', { died: '1965-01-21', diedIn: 'Bombay, India', notes: 'Actor, born Harkirtan Kaur. Died of smallpox at 34.', tags: [ACTOR] }],
  ['neila', 'Neila Devi', 'Kapoor', 'f', '~1941-08-12', undefined, { maiden: 'Gohil', notes: 'From the royal family of Bhavnagar in Gujarat. Married Shammi in 1969.' }],
  ['shashi', 'Shashi', 'Kapoor', 'm', '1938-03-18', 'Calcutta, India', { died: '2017-12-04', diedIn: 'Mumbai, India', notes: 'Actor in Hindi and English films. Built Prithvi Theatre in Mumbai with Jennifer, opened in 1978.', tags: [ACTOR, PRODUCER] }],
  ['jennifer', 'Jennifer', 'Kendal', 'f', '1933-02-28', 'Southport, England', { died: '1984-09-07', diedIn: 'London, England', notes: 'English stage and film actor. Ran Prithvi Theatre with Shashi.', tags: [ACTOR, THEATRE] }],

  ['randhir', 'Randhir', 'Kapoor', 'm', '1947-02-15', 'Bombay, India', { notes: 'Actor and director. His Kal Aaj Aur Kal (1971) starred three generations: Prithviraj, Raj and himself.', tags: [ACTOR, DIRECTOR] }],
  ['babita', 'Babita', 'Kapoor', 'f', '1947-04-20', 'Karachi, British India', { maiden: 'Shivdasani', notes: 'Actor in films of the 1960s. Mother of Karisma and Kareena.', tags: [ACTOR] }],
  ['ritu', 'Ritu', 'Nanda', 'f', '1948-10-30', undefined, { maiden: 'Kapoor', died: '2020-01-14', notes: "Raj's elder daughter. Sold insurance for the Life Insurance Corporation for years." }],
  ['rajan', 'Rajan', 'Nanda', 'm', '~1942-05-20', undefined, { died: '2018-08-05', notes: 'Chairman of the Escorts group, which makes tractors.' }],
  ['rishi', 'Rishi', 'Kapoor', 'm', '1952-09-04', 'Bombay, India', { died: '2020-04-30', diedIn: 'Mumbai, India', notes: 'Actor. His first lead role was in Bobby (1973), directed by his father.', tags: [ACTOR] }],
  ['neetu', 'Neetu', 'Kapoor', 'f', '1958-07-08', 'New Delhi, India', { maiden: 'Singh', notes: 'Actor. She and Rishi made many films together before they married in 1980.', tags: [ACTOR] }],
  ['rima', 'Rima', 'Jain', 'f', '~1955-04-22', undefined, { maiden: 'Kapoor', notes: "Raj's younger daughter." }],
  ['manoj', 'Manoj', 'Jain', 'm', '~1953-09-14', undefined, { notes: 'Banker and businessman.' }],
  ['rajiv', 'Rajiv', 'Kapoor', 'm', '1962-08-25', 'Bombay, India', { died: '2021-02-09', diedIn: 'Mumbai, India', notes: 'Actor, best known for Ram Teri Ganga Maili (1985).', tags: [ACTOR] }],
  ['aditya', 'Aditya Raj', 'Kapoor', 'm', '1956-07-01', 'Bombay, India', { notes: 'Actor, director and businessman.', tags: [ACTOR, DIRECTOR] }],
  ['kanchan', 'Kanchan', 'Desai', 'f', '1961-08-08', undefined, { maiden: 'Kapoor', notes: "Shammi and Geeta's daughter." }],
  ['kunal', 'Kunal', 'Kapoor', 'm', '1959-06-26', 'Bombay, India', { notes: 'Actor in the 1980s, then a maker of ad films.', tags: [ACTOR] }],
  ['karan', 'Karan', 'Kapoor', 'm', '1962-01-18', 'Bombay, India', { notes: 'Actor and model, later a photographer in London.', tags: [ACTOR] }],
  ['sanjana', 'Sanjana', 'Kapoor', 'f', '1967-11-27', 'Bombay, India', { notes: 'Ran Prithvi Theatre from 1993 to 2012.', tags: [THEATRE] }],
  ['amitabh', 'Amitabh', 'Bachchan', 'm', '1942-10-11', 'Allahabad, India', { notes: 'Actor, one of the biggest stars Hindi cinema has had.', tags: [ACTOR] }],
  ['jaya', 'Jaya', 'Bachchan', 'f', '1948-04-09', 'Jabalpur, India', { maiden: 'Bhaduri', notes: 'Actor and member of parliament.', tags: [ACTOR] }],
  ['mahesh', 'Mahesh', 'Bhatt', 'm', '1948-09-20', 'Bombay, India', { notes: 'Film director and producer.', tags: [DIRECTOR, PRODUCER] }],
  ['soni', 'Soni', 'Razdan', 'f', '1956-10-25', 'Birmingham, England', { notes: 'Actor and director.', tags: [ACTOR, DIRECTOR] }],

  ['karisma', 'Karisma', 'Kapoor', 'f', '1974-06-25', 'Bombay, India', { notes: 'Actor. Her first film was Prem Qaidi (1991).', tags: [ACTOR] }],
  ['sunjay', 'Sunjay', 'Kapur', 'm', '1971-10-15', 'Delhi, India', { died: '2025-06-12', diedIn: 'Windsor, England', notes: 'Industrialist who led the car parts maker Sona Comstar.' }],
  ['kareena', 'Kareena', 'Kapoor Khan', 'f', '1980-09-21', 'Bombay, India', { notes: 'Actor, known for Jab We Met (2007).', tags: [ACTOR] }],
  ['saif', 'Saif Ali', 'Khan', 'm', '1970-08-16', 'New Delhi, India', { notes: 'Actor. His parents are the cricketer Mansoor Ali Khan Pataudi and the actor Sharmila Tagore.', tags: [ACTOR] }],
  ['amrita', 'Amrita', 'Singh', 'f', '1958-02-09', 'Delhi, India', { notes: 'Actor. Her first film was Betaab (1983).', tags: [ACTOR] }],
  ['nikhil', 'Nikhil', 'Nanda', 'm', '1973-03-18', 'New Delhi, India', { notes: 'Took over the Escorts group from his father in 2018.' }],
  ['shweta', 'Shweta', 'Nanda', 'f', '1974-03-17', 'Bombay, India', { maiden: 'Bachchan', notes: 'Writer. Her novel Paradise Towers came out in 2018.' }],
  ['riddhima', 'Riddhima', 'Kapoor Sahni', 'f', '1980-09-15', undefined, { notes: 'Jewellery designer.' }],
  ['bharat', 'Bharat', 'Sahni', 'm', '~1977-11-03', undefined, { notes: 'Businessman.' }],
  ['ranbir', 'Ranbir', 'Kapoor', 'm', '1982-09-28', 'Bombay, India', { notes: 'Actor. His first film was Saawariya (2007).', tags: [ACTOR] }],
  ['alia', 'Alia', 'Bhatt', 'f', '1993-03-15', 'Bombay, India', { notes: 'Actor. Won a National Film Award for Gangubai Kathiawadi (2022).', tags: [ACTOR] }],
  ['armaan', 'Armaan', 'Jain', 'm', '~1990-11-24', undefined, { notes: 'Actor. His first film was Lekar Hum Deewana Dil (2014).', tags: [ACTOR] }],
  ['anissa', 'Anissa', 'Jain', 'f', '~1992-07-09', undefined, { maiden: 'Malhotra', notes: 'Married Armaan in 2020.' }],
  ['aadar', 'Aadar', 'Jain', 'm', '~1994-08-05', undefined, { notes: 'Actor. His first film was Qaidi Band (2017).', tags: [ACTOR] }],

  ['samaira', 'Samaira', 'Kapur', 'f', '2005-03-11', undefined, { notes: "Karisma and Sunjay's daughter." }],
  ['sara', 'Sara Ali', 'Khan', 'f', '1995-08-12', 'Bombay, India', { notes: 'Actor. Her first film was Kedarnath (2018).', tags: [ACTOR] }],
  ['ibrahim', 'Ibrahim Ali', 'Khan', 'm', '2001-03-05', undefined, { notes: 'Actor. His first film was Nadaaniyan (2025).', tags: [ACTOR] }],
  ['navya', 'Navya Naveli', 'Nanda', 'f', '~1997-12-06', undefined, { notes: 'Started Aara Health, a health platform for women.' }],
  ['agastya', 'Agastya', 'Nanda', 'm', '~2000-11-23', undefined, { notes: 'Actor. His first film was The Archies (2023).', tags: [ACTOR] }],

  // The Bhatts (F11): Alia's father's family, and Emraan Hashmi through Shirin's sister Purnima
  ['nanabhai', 'Nanabhai', 'Bhatt', 'm', '1915-06-12', 'Porbandar, India', { died: '1999-04-24', diedIn: 'Mumbai, India', notes: 'Film director and producer.', tags: [DIRECTOR, PRODUCER] }],
  ['shirin', 'Shirin', 'Mohammad Ali', 'f', '~1920-05-10', undefined, { died: '?', notes: 'Married Nanabhai in 1939. Her sister Purnima was an actor.' }],
  ['hemlata', 'Hemlata', 'Bhatt', 'f', '~1922-01-15', undefined, { died: '?', notes: "Robin's mother." }],
  ['robin', 'Robin', 'Bhatt', 'm', '1946-03-10', 'Bombay, India', { notes: 'Screenwriter.' }],
  ['sheila', 'Sheila', 'Darshan', 'f', '~1940-08-20', undefined, { maiden: 'Bhatt', died: '2009', notes: "Mahesh's elder sister." }],
  ['mukesh', 'Mukesh', 'Bhatt', 'm', '1952-06-05', 'Bombay, India', { notes: 'Film producer. Runs Vishesh Films with Mahesh.', tags: [PRODUCER] }],
  ['heena', 'Heena', 'Suri', 'f', '~1953-02-14', undefined, { maiden: 'Bhatt', died: '1990', notes: 'An air hostess.' }],
  ['neelima', 'Neelima', 'Bhatt', 'f', '~1958-03-03', undefined, { notes: "Vishesh's mother." }],
  ['vishesh', 'Vishesh', 'Bhatt', 'm', '~1988-09-12', 'Bombay, India', { notes: 'Director and producer.', tags: [DIRECTOR, PRODUCER] }],
  ['kiran', 'Kiran', 'Bhatt', 'f', '~1950-07-01', undefined, { maiden: 'Bright', notes: 'Born Lorraine Bright. Married Mahesh in 1970.' }],
  ['pooja', 'Pooja', 'Bhatt', 'f', '1972-02-24', 'Bombay, India', { notes: 'Actor, director and producer. Her first film was Daddy (1989).', tags: [ACTOR, DIRECTOR, PRODUCER] }],
  ['manish', 'Manish', 'Makhija', 'm', '~1970-06-06', undefined, { notes: 'Married to Pooja from 2003 to 2014.' }],
  ['rahul', 'Rahul', 'Bhatt', 'm', '1982-01-24', 'Bombay, India', { notes: "Mahesh and Kiran's son." }],
  ['shaheen', 'Shaheen', 'Bhatt', 'f', '~1988-11-28', 'Bombay, India', { notes: 'Writer.' }],
  ['darshan', 'Darshan', 'Sabharwal', 'm', '~1936-04-04', undefined, { notes: "Dharmesh's father." }],
  ['dharmesh', 'Dharmesh', 'Darshan', 'm', '1967-05-16', 'Bombay, India', { notes: 'Director, known for Raja Hindustani (1996).', tags: [DIRECTOR] }],
  ['daksh', 'Daksh', 'Suri', 'm', '~1950-10-10', undefined, { notes: 'Worked for Dunlop in Chennai.' }],
  ['mohit', 'Mohit', 'Suri', 'm', '1981-04-11', 'Bombay, India', { notes: 'Director, known for Aashiqui 2 (2013).', tags: [DIRECTOR] }],
  ['udita', 'Udita', 'Goswami', 'f', '1984-02-09', 'Dehradun, India', { notes: 'Actor. Married Mohit in 2013.', tags: [ACTOR] }],
  ['smilie', 'Smilie', 'Suri', 'f', '~1983-01-25', 'Bombay, India', { notes: 'Actor.', tags: [ACTOR] }],
  ['purnima', 'Purnima', '', 'f', '1932-03-02', 'Bombay, India', { maiden: 'Mohammad Ali', died: '2013-08-14', diedIn: 'Mumbai, India', notes: 'Actor, born Meher Bano Muhammad Ali.', tags: [ACTOR] }],
  ['shauqat', 'Syed Shauqat', 'Hashmi', 'm', '~1925-01-01', undefined, { died: '?', notes: 'Journalist and film director. Later moved to Pakistan.', tags: [DIRECTOR] }],
  ['anwar', 'Anwar', 'Hashmi', 'm', '~1952-06-15', undefined, { notes: 'Businessman.' }],
  ['maherrah', 'Maherrah', 'Hashmi', 'f', '~1955-02-20', undefined, { notes: "Emraan's mother." }],
  ['emraan', 'Emraan', 'Hashmi', 'm', '1979-03-24', 'Bombay, India', { notes: 'Actor, known for Murder (2004).', tags: [ACTOR] }],
  ['parveen', 'Parveen', 'Shahani', 'f', '~1981-05-05', undefined, { notes: 'Married Emraan in 2006.' }],

  // The Bachchans (F11): Shweta's father's family, and her mother Jaya's parents
  ['harivansh', 'Harivansh Rai', 'Bachchan', 'm', '1907-11-27', 'Babupatti, India', { died: '2003-01-18', diedIn: 'Mumbai, India', notes: 'Poet, known for Madhushala (1935).' }],
  ['shyama', 'Shyama', 'Bachchan', 'f', '~1910-04-01', undefined, { died: '1936', notes: "Harivansh Rai's first wife." }],
  ['teji', 'Teji', 'Bachchan', 'f', '1914-08-12', 'Lyallpur, British India', { maiden: 'Suri', died: '2007-12-21', diedIn: 'Mumbai, India', notes: 'Born Teji Kaur Suri. Married Harivansh Rai in 1941.' }],
  ['ajitabh', 'Ajitabh', 'Bachchan', 'm', '~1947-05-18', undefined, { notes: 'Businessman.' }],
  ['ramola', 'Ramola', 'Bachchan', 'f', '~1952-09-09', undefined, { notes: 'Entrepreneur.' }],
  ['nilima', 'Nilima', 'Bachchan', 'f', '~1980-03-11', undefined, { notes: 'Aeronautical engineer.' }],
  ['namrita', 'Namrita', 'Bachchan', 'f', '~1982-07-21', undefined, { notes: 'Painter and graphic designer.' }],
  ['naina', 'Naina', 'Bachchan', 'f', '~1985-02-02', undefined, { notes: 'Investment banker.' }],
  ['kunalActor', 'Kunal', 'Kapoor', 'm', '1977-10-18', 'Bombay, India', { notes: 'Actor, not related to the Kapoor family. His first film was Meenaxi (2004).', tags: [ACTOR] }],
  ['bhim', 'Bhim', 'Bachchan', 'm', '~1987-12-12', undefined, { notes: 'Investment banker.' }],
  ['abhishek', 'Abhishek', 'Bachchan', 'm', '1976-02-05', 'Bombay, India', { notes: 'Actor. His first film was Refugee (2000).', tags: [ACTOR] }],
  ['aishwarya', 'Aishwarya', 'Rai Bachchan', 'f', '1973-11-01', 'Mangalore, India', { maiden: 'Rai', notes: 'Actor, and Miss World 1994.', tags: [ACTOR] }],
  ['tarun', 'Tarun Kumar', 'Bhaduri', 'm', '~1924-01-20', undefined, { died: '?', notes: 'Journalist and writer.' }],
  ['indira', 'Indira', 'Bhaduri', 'f', '~1928-06-30', undefined, { died: '?', notes: "Jaya's mother." }],
]

// [id, partners, children, status, start, end]
type FamRow = [id: string, partners: string[], children: string[], status?: FamilyStatus, start?: string, end?: string]

const FAMILIES: FamRow[] = [
  ['f_basheshwarnath', ['basheshwarnath'], ['prithviraj', 'trilok']],
  ['f_prithviraj', ['prithviraj', 'ramsarni'], ['raj', 'shammi', 'shashi'], 'married', '1923'],
  ['f_raj', ['raj', 'krishna'], ['randhir', 'ritu', 'rishi', 'rima', 'rajiv'], 'married', '1946-05-12'],
  ['f_shammi', ['shammi', 'geeta'], ['aditya', 'kanchan'], 'widowed', '1955-08-23'],
  ['f_shammi_neila', ['shammi', 'neila'], [], 'married', '1969-01-27'],
  ['f_shashi', ['shashi', 'jennifer'], ['kunal', 'karan', 'sanjana'], 'widowed', '1958-07'],
  ['f_randhir', ['randhir', 'babita'], ['karisma', 'kareena'], 'married', '1971-11-06'],
  ['f_ritu', ['rajan', 'ritu'], ['nikhil'], 'married'],
  ['f_rishi', ['rishi', 'neetu'], ['riddhima', 'ranbir'], 'married', '1980-01-22'],
  ['f_rima', ['manoj', 'rima'], ['armaan', 'aadar'], 'married'],
  ['f_amitabh', ['amitabh', 'jaya'], ['shweta', 'abhishek'], 'married', '1973'],
  ['f_mahesh', ['mahesh', 'soni'], ['shaheen', 'alia'], 'married', '1986'],
  ['f_karisma', ['sunjay', 'karisma'], ['samaira'], 'divorced', '2003', '2016'],
  ['f_saif_amrita', ['saif', 'amrita'], ['sara', 'ibrahim'], 'divorced', '1991-01', '2004'],
  ['f_saif_kareena', ['saif', 'kareena'], [], 'married', '2012-10-16'],
  ['f_nikhil', ['nikhil', 'shweta'], ['navya', 'agastya'], 'married', '1997-02-16'],
  ['f_riddhima', ['bharat', 'riddhima'], [], 'married', '2006'],
  ['f_ranbir', ['ranbir', 'alia'], [], 'married', '2022-04-14'],
  ['f_armaan', ['armaan', 'anissa'], [], 'married', '2020-02-03'],

  // The Bhatts. Shirin and Purnima's parents aren't recorded, so the sisters share a family with none.
  ['f_shirin_sisters', [], ['shirin', 'purnima']],
  ['f_nanabhai_hemlata', ['nanabhai', 'hemlata'], ['robin'], 'married'],
  ['f_nanabhai', ['nanabhai', 'shirin'], ['sheila', 'mahesh', 'mukesh', 'heena'], 'married', '1939'],
  ['f_mahesh_kiran', ['mahesh', 'kiran'], ['pooja', 'rahul'], 'married', '1970'],
  ['f_pooja', ['manish', 'pooja'], [], 'divorced', '2003', '2014'],
  ['f_mukesh', ['mukesh', 'neelima'], ['vishesh'], 'married'],
  ['f_sheila', ['darshan', 'sheila'], ['dharmesh'], 'married'],
  ['f_heena', ['daksh', 'heena'], ['mohit', 'smilie'], 'married'],
  ['f_mohit', ['mohit', 'udita'], [], 'married', '2013'],
  ['f_purnima', ['shauqat', 'purnima'], ['anwar'], 'divorced', undefined, '1947'],
  ['f_anwar', ['anwar', 'maherrah'], ['emraan'], 'married'],
  ['f_emraan', ['emraan', 'parveen'], [], 'married', '2006-12'],

  // The Bachchans
  ['f_harivansh_shyama', ['harivansh', 'shyama'], [], 'widowed', '1926'],
  ['f_harivansh', ['harivansh', 'teji'], ['amitabh', 'ajitabh'], 'married', '1941'],
  ['f_ajitabh', ['ajitabh', 'ramola'], ['nilima', 'namrita', 'naina', 'bhim'], 'married'],
  ['f_naina', ['kunalActor', 'naina'], [], 'married', '2015'],
  ['f_abhishek', ['abhishek', 'aishwarya'], [], 'married', '2007-04-20'],
  ['f_bhaduri', ['tarun', 'indira'], ['jaya'], 'married'],
]

// The sample's version. A browser that saved an older sample opens this one instead (boot.ts).
const STAMP = '2026-10-09T00:00:00.000Z'

/** '1906-11-03', '1958-07' or '1923', with ~ in front for a made-up date */
function date(s: string): PartialDate {
  const [year, month, day] = s.replace('~', '').split('-').map(Number)
  return { year, ...(month ? { month } : {}), ...(day ? { day } : {}), ...(s.startsWith('~') ? { approx: true } : {}) }
}

export function sampleTree(id = 'sample'): TreeDoc {
  const people: Record<string, Person> = {}
  for (const [pid, firstName, lastName, g, born, place, x = {}] of ROWS) {
    const p: Person = {
      id: pid,
      firstName,
      ...(lastName ? { lastName } : {}),
      gender: g === 'm' ? 'male' : 'female',
      birth: { date: date(born), ...(place ? { place } : {}) },
      createdAt: STAMP,
      updatedAt: STAMP,
    }
    if (x.maiden) p.birthSurname = x.maiden
    if (x.died) {
      p.deceased = true
      if (x.died !== '?') p.death = { date: date(x.died), ...(x.diedIn ? { place: x.diedIn } : {}) }
    }
    if (x.notes) p.notes = x.notes
    if (x.tags) p.tags = x.tags
    if (pid in credits) p.photoId = `sample-${pid}`
    people[pid] = p
  }
  const families: Record<string, Family> = {}
  for (const [fid, partnerIds, children, status, start, end] of FAMILIES) {
    families[fid] = {
      id: fid,
      partnerIds,
      ...(status ? { status } : {}),
      ...(start ? { start: date(start) } : {}),
      ...(end ? { end: date(end) } : {}),
      children: children.map((c) => ({ personId: c, kind: 'biological' })),
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: 'The Kapoor Family',
    titleAuto: false,
    subtitle: 'From Peshawar to Bombay',
    showStats: true,
    homePersonId: 'ranbir',
    people,
    families,
    // It opens mostly tucked away, so the first view is light and quick (F11, TODO.md F17): Ranbir's
    // own line with each aunt's and uncle's children behind a pill, and the Bhatts behind one above
    // Alia. Opening a pill shows one more layer: Mahesh's and the Bachchans' ancestors have pills
    // of their own.
    view: {
      ...emptyView(),
      collapsedFamilies: ['f_shammi', 'f_shashi', 'f_randhir', 'f_ritu', 'f_rima'],
      collapsedAncestors: ['alia', 'mahesh', 'amitabh', 'jaya'],
    },
    meta: { createdAt: STAMP, updatedAt: STAMP, app: 'jangal' },
  }
}
