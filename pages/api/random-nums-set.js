import dbConnect from '../../utils/dbConnect';
import NumOfTheDay from '../../models/DailyRandomNum';
import UsedNum from '../../models/UsedNum';

const wordListLen = 12950;

// gets random num between 0 and (maxVal - 1) that is not in the usedNumsArr
function getUnUsedRandomNum(usedNumsArr, maxVal) {
  const usedNumsArrLen = usedNumsArr.length;
  const hash = {};
  for (let i = 0; i < usedNumsArrLen; i += 1) {
    hash[usedNumsArr[i]] = 1;
  }

  let gotRandomNum = false;
  let randomNum;

  while (!gotRandomNum) {
    // loop until you get an unused random number
    randomNum = Math.floor(Math.random() * maxVal);

    if (!hash[randomNum]) {
      gotRandomNum = true;
    }
  }

  return randomNum;
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    console.log('POST request');
    try {
      const { authorization } = req.headers;
      if (authorization === `Bearer ${process.env.ACTION_FETCH_RANDOM_NUM}`) {
        console.log('authorized');
        await dbConnect();

        // get array of used random nums
        let usedRandomNums = await UsedNum.findOne({
          name: 'Used random numbers',
        });
        console.log('usedRandomNums', usedRandomNums);
        let usedRandomNumsArr = usedRandomNums.usedNumbers;
        console.log('usedRandomNumsArr', usedRandomNumsArr);
        const usedRandomNumsArrLen = usedRandomNumsArr.length;
        console.log('usedRandomNumsArrLen', usedRandomNumsArrLen);

        // reset random nums used every ~year
        if (usedRandomNumsArrLen > 365) {
          const lastUsedRandomNumsRaw = await NumOfTheDay.find();

          const lastUsedRandomNums = lastUsedRandomNumsRaw.map(
            (el) => el.number
          );

          usedRandomNums = await UsedNum.findOneAndUpdate(
            { name: 'Used random numbers' },
            { usedNumbers: lastUsedRandomNums },
            // return the modified document rather than the original
            { new: true }
          );
        }

        usedRandomNumsArr = usedRandomNums.usedNumbers;

        const unUsedRandomNum = getUnUsedRandomNum(
          usedRandomNumsArr,
          wordListLen
        );

        console.log(
          'unUsedRandomNum, wordListLen: ',
          unUsedRandomNum,
          wordListLen
        );

        // get date for new day UTC +14 (api called by GitHub action at 10am UTC / midnight UTC +14)
        // next day (+ 1 day)
        const UTCDate = new Date();
        console.log('UTCDate: ', UTCDate);

        UTCDate.setDate(UTCDate.getDate() + 1);
        // get format: yyyy/mm/dd
        const dateHigh = UTCDate.toLocaleDateString('en-GB');
        UTCDate.setDate(UTCDate.getDate() - 3);
        const dateLow = UTCDate.toLocaleDateString('en-GB');

        console.log('dateLow, dateHigh: ', dateLow, dateHigh);

        const highDateObj = {
          date: dateHigh,
          number: unUsedRandomNum,
        };

        console.log('highDateObj: ', highDateObj);

        // add new random num
        const newNumOfTheDayAddPromise = await new NumOfTheDay(
          highDateObj
        ).save();

        // add new random num to UsedNum collection - replace prev array
        usedRandomNumsArr.push(unUsedRandomNum);

        console.log('usedRandomNumsArr updated: ', usedRandomNumsArr);

        const addNewRandomNumPromise = await UsedNum.findOneAndUpdate(
          { name: 'Used random numbers' },
          { usedNumbers: usedRandomNumsArr }
        );

        // delete oldest random num
        const oldNumOfTheDayDeletePromise = await NumOfTheDay.findOneAndDelete({
          date: dateLow,
        });

        console.log(
          'all promises: ',
          newNumOfTheDayAddPromise,
          addNewRandomNumPromise,
          oldNumOfTheDayDeletePromise
        );

        await Promise.all([
          newNumOfTheDayAddPromise,
          addNewRandomNumPromise,
          oldNumOfTheDayDeletePromise,
        ]);

        console.log('all promises resolved');

        res.status(200).json({ success: true });
      } else {
        res.status(401).json({ success: false });
      }
    } catch (err) {
      res.status(500).json({
        message: err,
        // message: 'Error setting new daily random numbers',
      });
    }
  } else {
    res.status(405).json({
      message: 'Method not allowed',
    });
  }
}
